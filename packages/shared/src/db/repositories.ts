/**
 * Data-access layer. Parameterised queries only (no string interpolation) to
 * prevent SQL injection (report 12.4 / brief security guidance).
 */
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { randomUUID } from 'node:crypto';
import { getPool } from './pool.js';
import type { Asset, AssetType, Job, JobState, StorageClass, User, UserRole } from '../domain/types.js';
import { CLAIMABLE_STATES, sourcesFor } from '../domain/jobStateMachine.js';

// ---------- mapping helpers ----------
function mapUser(r: RowDataPacket): User {
  return {
    id: r.id,
    email: r.email,
    role: r.role,
    displayName: r.display_name,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function mapAsset(r: RowDataPacket): Asset {
  return {
    id: r.id,
    ownerId: r.owner_id,
    title: r.title,
    type: r.type,
    s3Key: r.s3_key,
    s3Bucket: r.s3_bucket,
    sizeBytes: Number(r.size_bytes),
    contentType: r.content_type,
    storageClass: r.storage_class,
    status: r.status,
    isDemo: !!r.is_demo,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function mapJob(r: RowDataPacket): Job {
  return {
    id: r.id,
    assetId: r.asset_id,
    state: r.state,
    attempts: Number(r.attempts),
    lastError: r.last_error ?? null,
    submittedAt: new Date(r.submitted_at).toISOString(),
    startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
  };
}

// ---------- users ----------
export const userRepo = {
  async create(input: {
    email: string;
    passwordHash: string;
    role: UserRole;
    displayName: string;
  }): Promise<User> {
    const id = randomUUID();
    await getPool().query(
      `INSERT INTO users (id, email, password_hash, role, display_name)
       VALUES (?, ?, ?, ?, ?)`,
      [id, input.email, input.passwordHash, input.role, input.displayName],
    );
    const user = await this.findById(id);
    if (!user) throw new Error('User creation failed');
    return user;
  },

  /**
   * Insert the user only if the email is not already registered. Existing
   * accounts are never modified (demo seeding must not reset passwords/roles).
   * Returns true when a new row was created.
   */
  async createIfAbsent(input: {
    email: string;
    passwordHash: string;
    role: UserRole;
    displayName: string;
  }): Promise<boolean> {
    const [existing] = await getPool().query<RowDataPacket[]>(
      'SELECT id FROM users WHERE email = ?',
      [input.email],
    );
    if (existing.length > 0) return false;
    // ON DUPLICATE KEY no-op keeps this safe if two instances race on startup.
    await getPool().query(
      `INSERT INTO users (id, email, password_hash, role, display_name)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE email = email`,
      [randomUUID(), input.email, input.passwordHash, input.role, input.displayName],
    );
    return true;
  },

  async findById(id: string): Promise<User | null> {
    const [rows] = await getPool().query<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  },

  async findByEmailWithHash(
    email: string,
  ): Promise<(User & { passwordHash: string }) | null> {
    const [rows] = await getPool().query<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows[0]) return null;
    return { ...mapUser(rows[0]), passwordHash: rows[0].password_hash };
  },
};

// ---------- assets ----------
export const assetRepo = {
  async create(input: {
    ownerId: string;
    title: string;
    type: AssetType;
    s3Key: string;
    s3Bucket: string;
    sizeBytes: number;
    contentType: string;
    isDemo: boolean;
  }): Promise<Asset> {
    const id = randomUUID();
    await getPool().query(
      `INSERT INTO assets
         (id, owner_id, title, type, s3_key, s3_bucket, size_bytes, content_type, storage_class, status, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'STANDARD', 'submitted', ?)`,
      [
        id,
        input.ownerId,
        input.title,
        input.type,
        input.s3Key,
        input.s3Bucket,
        input.sizeBytes,
        input.contentType,
        input.isDemo ? 1 : 0,
      ],
    );
    const asset = await this.findById(id);
    if (!asset) throw new Error('Asset creation failed');
    return asset;
  },

  async findById(id: string): Promise<Asset | null> {
    const [rows] = await getPool().query<RowDataPacket[]>('SELECT * FROM assets WHERE id = ?', [id]);
    return rows[0] ? mapAsset(rows[0]) : null;
  },

  async list(filter?: { type?: AssetType; status?: JobState }): Promise<Asset[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter?.type) { where.push('type = ?'); params.push(filter.type); }
    if (filter?.status) { where.push('status = ?'); params.push(filter.status); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT * FROM assets ${clause} ORDER BY created_at DESC LIMIT 200`,
      params,
    );
    return rows.map(mapAsset);
  },

  async setStatus(id: string, status: JobState): Promise<void> {
    await getPool().query('UPDATE assets SET status = ? WHERE id = ?', [status, id]);
  },

  async setStorageClass(id: string, storageClass: StorageClass): Promise<void> {
    await getPool().query('UPDATE assets SET storage_class = ? WHERE id = ?', [storageClass, id]);
  },

  async countByStatus(): Promise<Record<JobState, number>> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      'SELECT status, COUNT(*) AS c FROM assets GROUP BY status',
    );
    const base: Record<JobState, number> = {
      submitted: 0, queued: 0, processing: 0, completed: 0, failed: 0,
    };
    for (const r of rows) base[r.status as JobState] = Number(r.c);
    return base;
  },

  async countByStorageClass(): Promise<Record<StorageClass, number>> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      'SELECT storage_class AS sc, COUNT(*) AS c FROM assets GROUP BY storage_class',
    );
    const base: Record<StorageClass, number> = { STANDARD: 0, GLACIER: 0 };
    for (const r of rows) base[r.sc as StorageClass] = Number(r.c);
    return base;
  },

  /** Assets older than N days — used by the lifecycle-tiering simulation. */
  async findOlderThanDays(days: number): Promise<Asset[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      'SELECT * FROM assets WHERE created_at < (NOW() - INTERVAL ? DAY)',
      [days],
    );
    return rows.map(mapAsset);
  },
};

// ---------- jobs ----------
export const jobRepo = {
  async create(assetId: string): Promise<Job> {
    const id = randomUUID();
    await getPool().query(
      `INSERT INTO jobs (id, asset_id, state, attempts) VALUES (?, ?, 'submitted', 0)`,
      [id, assetId],
    );
    const job = await this.findById(id);
    if (!job) throw new Error('Job creation failed');
    return job;
  },

  async findById(id: string): Promise<Job | null> {
    const [rows] = await getPool().query<RowDataPacket[]>('SELECT * FROM jobs WHERE id = ?', [id]);
    return rows[0] ? mapJob(rows[0]) : null;
  },

  /**
   * Conditional state change: applied only if the job is currently in a state
   * the state machine allows to move to `to` (or in `opts.from`, when given).
   * Returns false when the row was not in an allowed state — e.g. a duplicate
   * SQS delivery finding the job already completed — so callers never
   * overwrite a newer state with an older one.
   */
  async transition(
    id: string,
    to: JobState,
    opts?: {
      from?: readonly JobState[];
      incrementAttempts?: boolean;
      error?: string | null;
      markStarted?: boolean;
      markFinished?: boolean;
    },
  ): Promise<boolean> {
    const from = opts?.from ?? sourcesFor(to);
    if (from.length === 0) return false;
    const sets: string[] = ['state = ?'];
    const params: unknown[] = [to];
    if (opts?.incrementAttempts) sets.push('attempts = attempts + 1');
    if (opts?.error !== undefined) { sets.push('last_error = ?'); params.push(opts.error); }
    if (opts?.markStarted) sets.push('started_at = CURRENT_TIMESTAMP');
    if (opts?.markFinished) sets.push('finished_at = CURRENT_TIMESTAMP');
    params.push(id, [...from]);
    const [res] = await getPool().query<ResultSetHeader>(
      `UPDATE jobs SET ${sets.join(', ')} WHERE id = ? AND state IN (?)`,
      params,
    );
    return res.affectedRows === 1;
  },

  /** Worker claim: queued (or crashed-mid-attempt processing) -> processing. */
  claim(id: string): Promise<boolean> {
    return this.transition(id, 'processing', {
      from: CLAIMABLE_STATES,
      incrementAttempts: true,
      markStarted: true,
    });
  },

  async activeCount(): Promise<number> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM jobs WHERE state IN ('submitted','queued','processing')`,
    );
    return Number(rows[0]?.c ?? 0);
  },

  async avgProcessingMs(): Promise<number> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT AVG(TIMESTAMPDIFF(MICROSECOND, started_at, finished_at)/1000) AS ms
       FROM jobs WHERE state = 'completed' AND started_at IS NOT NULL AND finished_at IS NOT NULL`,
    );
    return Math.round(Number(rows[0]?.ms ?? 0));
  },
};

// ---------- resource access (student opens) ----------
export interface TypeCounts {
  opened: number;
  available: number;
}

export interface AccessEntry {
  asset: Asset;
  firstOpenedAt: string;
  lastOpenedAt: string;
  openCount: number;
}

export interface StudentProgress {
  /** Completed resources currently in the library. */
  available: number;
  /** Distinct completed resources this student has opened. */
  opened: number;
  /** opened / available (0 when nothing is available). */
  coverage: number;
  lastOpenedAt: string | null;
  byType: Record<AssetType, TypeCounts>;
  recent: AccessEntry[];
}

export const accessRepo = {
  /** Record one open: first open inserts, later opens bump the count and time. */
  async recordOpen(userId: string, assetId: string): Promise<void> {
    await getPool().query(
      `INSERT INTO resource_access (user_id, asset_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE open_count = open_count + 1, last_opened_at = CURRENT_TIMESTAMP`,
      [userId, assetId],
    );
  },

  /**
   * Aggregate for GET /me/progress. Only currently completed assets count on
   * both sides, so `opened` can never exceed `available`.
   */
  async progressFor(userId: string, recentLimit = 6): Promise<StudentProgress> {
    const pool = getPool();
    const [availRows] = await pool.query<RowDataPacket[]>(
      `SELECT type, COUNT(*) AS c FROM assets WHERE status = 'completed' GROUP BY type`,
    );
    const [openedRows] = await pool.query<RowDataPacket[]>(
      `SELECT a.type, COUNT(*) AS c, MAX(ra.last_opened_at) AS last
       FROM resource_access ra JOIN assets a ON a.id = ra.asset_id
       WHERE ra.user_id = ? AND a.status = 'completed'
       GROUP BY a.type`,
      [userId],
    );
    const [recentRows] = await pool.query<RowDataPacket[]>(
      `SELECT a.*, ra.first_opened_at AS ra_first, ra.last_opened_at AS ra_last, ra.open_count AS ra_count
       FROM resource_access ra JOIN assets a ON a.id = ra.asset_id
       WHERE ra.user_id = ? AND a.status = 'completed'
       ORDER BY ra.last_opened_at DESC
       LIMIT ?`,
      [userId, recentLimit],
    );

    const byType: Record<AssetType, TypeCounts> = {
      document: { opened: 0, available: 0 },
      book: { opened: 0, available: 0 },
      video: { opened: 0, available: 0 },
    };
    for (const r of availRows) if (r.type in byType) byType[r.type as AssetType].available = Number(r.c);
    let last: Date | null = null;
    for (const r of openedRows) {
      if (r.type in byType) byType[r.type as AssetType].opened = Number(r.c);
      const d = r.last ? new Date(r.last) : null;
      if (d && (!last || d > last)) last = d;
    }
    const types = Object.values(byType);
    const available = types.reduce((n, t) => n + t.available, 0);
    const opened = types.reduce((n, t) => n + t.opened, 0);

    return {
      available,
      opened,
      coverage: available > 0 ? Math.round((opened / available) * 10_000) / 10_000 : 0,
      lastOpenedAt: last ? last.toISOString() : null,
      byType,
      recent: recentRows.map((r) => ({
        asset: mapAsset(r),
        firstOpenedAt: new Date(r.ra_first).toISOString(),
        lastOpenedAt: new Date(r.ra_last).toISOString(),
        openCount: Number(r.ra_count),
      })),
    };
  },
};

// ---------- request metrics (local mirror of CloudWatch) ----------
export const metricsRepo = {
  async record(input: {
    route: string;
    method: string;
    statusCode: number;
    latencyMs: number;
    isDemo?: boolean;
  }): Promise<void> {
    await getPool().query<ResultSetHeader>(
      `INSERT INTO request_metrics (route, method, status_code, latency_ms, is_demo)
       VALUES (?, ?, ?, ?, ?)`,
      [input.route, input.method, input.statusCode, input.latencyMs, input.isDemo ? 1 : 0],
    );
  },

  async summary(): Promise<{
    total: number;
    success: number;
    clientErrors: number;
    serverErrors: number;
    http400LastMinute: number;
    avgLatencyMs: number;
  }> {
    const pool = getPool();
    const [agg] = await pool.query<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS total,
         SUM(status_code >= 200 AND status_code < 400) AS success,
         SUM(status_code >= 400 AND status_code < 500) AS client_errors,
         SUM(status_code >= 500) AS server_errors,
         AVG(latency_ms) AS avg_latency
       FROM request_metrics`,
    );
    const [recent] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM request_metrics
       WHERE status_code = 400 AND ts >= (NOW() - INTERVAL 60 SECOND)`,
    );
    const row = agg[0] ?? {};
    return {
      total: Number(row.total ?? 0),
      success: Number(row.success ?? 0),
      clientErrors: Number(row.client_errors ?? 0),
      serverErrors: Number(row.server_errors ?? 0),
      http400LastMinute: Number(recent[0]?.c ?? 0),
      avgLatencyMs: Math.round(Number(row.avg_latency ?? 0)),
    };
  },
};
