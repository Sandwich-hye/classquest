/**
 * Idempotent schema creation (design.md §4). MySQL-5.7-compatible DDL so the
 * legacy ClassQuest schema migrates without changes (report 2.3.3 / 5.3.2).
 */
import type { Pool } from 'mysql2/promise';
import { getPool } from './pool.js';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id            CHAR(36) NOT NULL PRIMARY KEY,
    email         VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('student','teacher','admin') NOT NULL DEFAULT 'student',
    display_name  VARCHAR(120) NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS assets (
    id            CHAR(36) NOT NULL PRIMARY KEY,
    owner_id      CHAR(36) NOT NULL,
    title         VARCHAR(200) NOT NULL,
    type          ENUM('document','book','video') NOT NULL,
    s3_key        VARCHAR(512) NOT NULL,
    s3_bucket     VARCHAR(255) NOT NULL,
    size_bytes    BIGINT NOT NULL DEFAULT 0,
    content_type  VARCHAR(120) NOT NULL,
    storage_class VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
    status        ENUM('submitted','queued','processing','completed','failed') NOT NULL DEFAULT 'submitted',
    is_demo       TINYINT(1) NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_assets_owner (owner_id),
    INDEX idx_assets_status (status),
    CONSTRAINT fk_assets_owner FOREIGN KEY (owner_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS jobs (
    id           CHAR(36) NOT NULL PRIMARY KEY,
    asset_id     CHAR(36) NOT NULL,
    state        ENUM('submitted','queued','processing','completed','failed') NOT NULL DEFAULT 'submitted',
    attempts     INT NOT NULL DEFAULT 0,
    last_error   TEXT NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at   TIMESTAMP NULL,
    finished_at  TIMESTAMP NULL,
    INDEX idx_jobs_asset (asset_id),
    INDEX idx_jobs_state (state),
    CONSTRAINT fk_jobs_asset FOREIGN KEY (asset_id) REFERENCES assets(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Local mirror of request metrics (also sent to CloudWatch) for the dashboard.
  `CREATE TABLE IF NOT EXISTS request_metrics (
    id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ts          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    route       VARCHAR(200) NOT NULL,
    method      VARCHAR(10) NOT NULL,
    status_code INT NOT NULL,
    latency_ms  INT NOT NULL DEFAULT 0,
    is_demo     TINYINT(1) NOT NULL DEFAULT 0,
    INDEX idx_metrics_ts (ts),
    INDEX idx_metrics_status (status_code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

export async function migrate(pool: Pool = getPool()): Promise<void> {
  for (const sql of STATEMENTS) {
    await pool.query(sql);
  }
}

/** Wait for MySQL to accept connections, then migrate. Used at service startup. */
export async function waitAndMigrate(maxAttempts = 30, delayMs = 2000): Promise<void> {
  const pool = getPool();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query('SELECT 1');
      await migrate(pool);
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
