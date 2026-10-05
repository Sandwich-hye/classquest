# ClassQuest Cloud Prototype — Design Specification

> Realises the architecture in the INFS803 ClassQuest report using **real AWS service APIs on
> LocalStack**, orchestrated by Docker Compose and provisioned by Terraform. Section refs (`§`)
> point into the source report.

## 1. Architecture Overview

The prototype preserves the report's **decoupled three-tier** shape (`§3.4`):

```
Browser (React SPA)
      │  HTTPS (http locally)
      ▼
┌─────────────────────┐   "Route 53 → NLB → public ALB" (§3.4, §4.8)
│  Gateway / Web Tier  │   presentation + edge; emits ALB-style access logs
└─────────┬───────────┘
          │  internal HTTP  ("internal ALB", §3.4, §4.8)
          ▼
┌─────────────────────┐
│   Application Tier   │   business logic; owns S3 + SQS + MySQL via IAM role
└───┬───────┬─────┬────┘
    │       │     │
    ▼       ▼     ▼
  MySQL   S3     SQS ──► Worker(s) ──► S3/MySQL + CloudWatch metrics
 (RDS eq) (obj) (queue)                     │
                                            └► CloudWatch Logs ─(metric filter: HTTP 400)─► Alarm ─► SNS
```

Each tier is an independent process/container (stateless Web + App + Worker), mirroring EC2 Auto
Scaling Groups that scale by replica count (`§5.1.4`, `§5.2.4`, `§9.4`).

## 2. Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React 18 + Vite + TypeScript | SPA matching the product mockups (Library / My Learning / Progress / Teacher Portal). |
| Web/App/Worker | Node.js 20 + TypeScript + Express | Lightweight, matches stateless-tier pattern; one language across services. |
| Data tier | MySQL 8 (Docker) | RDS-for-MySQL stand-in; MySQL-5.7-compatible schema (`§5.3.2`). |
| Cloud APIs | AWS SDK v3 → LocalStack | Exercises real S3/SQS/SNS/CloudWatch/IAM APIs (`§7` mapping). |
| IaC | Terraform | `§2.7`, §10.9 call for IaC; dual targets (localstack / aws). |
| Orchestration | Docker Compose | One-command reproducible stack (NFR-8). |
| Tests | Vitest + Supertest | Unit/API/integration/e2e. |

## 3. Components

### 3.1 `packages/shared` (core library)
- **cloud/clients.ts** — AWS SDK v3 clients configured from env (`AWS_ENDPOINT_URL` → LocalStack). Single place that flips between LocalStack and real AWS.
- **cloud/storage.ts** — `StorageService`: `putObject`, `getPresignedUrl`, `headObjectTier`, `simulateLifecycle`. Wraps S3. (`§5.4`)
- **cloud/queue.ts** — `QueueService`: `enqueue`, `receive`, `deleteMessage`, DLQ awareness. Wraps SQS. (`§3.7`)
- **cloud/metrics.ts** — `MetricsService`: `putMetric`, `incrementCounter`, `recordLatency` → CloudWatch. (`§7`)
- **cloud/alerts.ts** — `AlertService`: ensures SNS topic; `publishAlert`. (`§7.8`)
- **cloud/logs.ts** — `AccessLogService`: writes ALB-style access-log lines to a CloudWatch Log Group that the metric filter watches. (`§7.6`)
- **auth/jwt.ts** — issue/verify JWTs; `requireRole`. (`§6.1`)
- **auth/iam.ts** — helper documenting/exercising role assumption for credential-less access. (`§2.3.6`, `§6.2`)
- **db/pool.ts**, **db/migrate.ts** — MySQL pool + schema migration/seed.
- **domain/** — `Asset`, `Job`, `JobState` state machine, validation schemas (zod).
- **config.ts**, **logger.ts** (pino, redacting secrets).

### 3.2 `services/web-tier`
Serves the SPA and is the single public entry. Verifies JWT, enforces rate limiting (WAF stand-in,
`§6.11`), proxies API calls to the App Tier over the internal network, and writes an **ALB-style
access log line per request** including `status_code` (drives the HTTP-400 metric filter, `§7.6`).

### 3.3 `services/app-tier`
Core business logic (`§3.4` logic layer). Endpoints:
- `POST /auth/login` → JWT
- `POST /assets` (teacher) → validate, `putObject` to S3, insert metadata, `enqueue` processing job (`submitted`)
- `GET /assets` / `GET /assets/:id` → list / presigned retrieval (`§4.9` step 6)
- `GET /jobs/:id` → job state
- `GET /dashboard/metrics` → aggregated real metrics
- `GET /health` → tier + dependency health
- `POST /demo/*` → seed, run success, induce failure, trigger 400 burst (demo mode)

Uses the App Tier IAM role for S3/SQS/CloudWatch — **no static keys in code** (`§6.2`, `§6.10`).

### 3.4 `services/worker`
Long-poll SQS, transition job `queued → processing → completed|failed`, write processing-time and
success/fail metrics to CloudWatch, update MySQL, honour retry/visibility-timeout, rely on the
queue's redrive policy to move poison messages to the **DLQ** (`§10.10`). Scales by replica count.

### 3.5 `apps/frontend`
React SPA with role-based routing. Visual language from the product mockups: navy `#0A1F44`,
green `#1DB882`, amber `#F5A623`. Views: Login, Student (Library / My Learning), Teacher Portal
(upload + publish + cohort), Admin Dashboard (metrics, jobs, storage tiers, alerts, system status).

## 4. Data Model (MySQL, 5.7-compatible — §5.3.2)

```sql
users(id PK, email UNIQUE, password_hash, role ENUM('student','teacher','admin'),
      display_name, created_at)

assets(id PK, owner_id FK->users, title, type ENUM('document','book','video'),
       s3_key, s3_bucket, size_bytes, content_type, storage_class VARCHAR,  -- STANDARD|GLACIER
       status ENUM('submitted','queued','processing','completed','failed'),
       is_demo BOOL, created_at, updated_at)

jobs(id PK, asset_id FK->assets, state VARCHAR, attempts INT, last_error TEXT,
     submitted_at, started_at, finished_at)

request_metrics(id PK, ts, route, method, status_code, latency_ms, is_demo)  -- local mirror of CW
```

## 5. API Contract (selected)

| Method | Path | Auth | Body / Query | 2xx | Errors |
|--------|------|------|--------------|-----|--------|
| POST | `/auth/login` | – | `{email,password}` | `{token,role}` | 400 invalid, 401 bad creds |
| POST | `/assets` | teacher | multipart `file`,`title`,`type` | `{assetId,jobId,status}` | 400 validation, 413 too large, 401/403 |
| GET | `/assets` | any | `?type=` | `[asset…]` | 401 |
| GET | `/assets/:id` | any | – | `{asset, downloadUrl}` | 404, 401 |
| GET | `/jobs/:id` | any | – | `{state,attempts,error?}` | 404 |
| GET | `/dashboard/metrics` | admin/teacher | – | metrics object | 401/403 |
| GET | `/health` | – | – | `{tier, deps:{s3,sqs,sns,cloudwatch,mysql}}` | 503 if degraded |

## 6. Job State Machine (§3.7, FR-5/FR-6)

```
submitted ─enqueue→ queued ─worker pick-up→ processing ─ok→ completed
                                             └─error & attempts<max→ (requeue) queued
                                             └─error & attempts≥max→ failed (message → DLQ)
```
Invalid transitions are rejected by the domain layer and unit-tested.

## 7. Cloud Resources (Terraform → LocalStack / AWS)

- **S3 bucket** `classquest-media-assets-<env>` — versioning on; Block Public Access; lifecycle rule `Standard → Glacier @90d → expire @1825d` (`§5.4.5`); SSE (documented).
- **SQS** `classquest-asset-processing` + redrive to `classquest-asset-processing-dlq` (maxReceiveCount=3).
- **SNS** topic `classquest-admin-alerts` with an email subscription (prod) / local capture.
- **CloudWatch Logs** group `/aws/alb/classquest-<env>`; **metric filter** pattern matching `status_code=400` → metric `HTTP400ErrorCount`; **alarm** `ClassQuest-HTTP400-HighErrorRate` (sum > 50 / 1 min, 1 datapoint) → SNS. (`§7.6–§7.8`)
- **IAM**: `classquest-app-role` (s3:Put/Get/List on bucket, sqs:Send/Receive/Delete, cloudwatch:PutMetricData, logs:PutLogEvents), `classquest-web-role` (s3:GetObject read-only, logs:PutLogEvents) — least privilege (`§2.3.6`, `§6.2`).

## 8. Security Design (§6, NFR-5)

- Human auth: JWT (short expiry) + bcrypt password hashes + RBAC middleware.
- Service auth: IAM role assumption; SDK obtains temporary creds — **zero static keys** (`§6.10`).
- Least privilege per-role policies (Web read-only vs App read/write) mirrors `§2.3.6`.
- Input validation (zod) on every endpoint; file type/size allow-list (`§13`).
- Rate limiting on the Web Tier (WAF/Shield stand-in, `§6.11`).
- Error responses are sanitized; internals go to logs only (`§6`, brief §13).
- Secrets from env / `.env` (gitignored); documented Secrets Manager mapping for prod (`§6.10`).
- S3 Block Public Access + presigned-URL-only retrieval (`§5.4.7`).

## 9. Error Handling (brief §13)

Central Express error middleware → `{error:{code,message,requestId}}`, correct HTTP status, full
detail logged with `requestId`. Dependency failures (S3/SQS/MySQL down) return `503` and mark the
tier degraded in `/health`. Worker failures increment `attempts`, requeue, then DLQ. Timeouts via
SDK config + request timeouts.

## 10. Observability Design (§7, NFR-6)

- Structured JSON logs (pino) with `requestId`, tier, route, status, latency.
- Every Web Tier request → ALB-style access log line in CloudWatch Logs (feeds the 400 filter).
- App/Worker emit custom CloudWatch metrics: `RequestCount`, `SuccessCount`, `FailureCount`,
  `ProcessingTimeMs`, `QueueDepth`.
- `/dashboard/metrics` aggregates from CloudWatch + the local `request_metrics` mirror.
- `/health` checks each dependency.

## 11. Deployment / Runtime Topology

Docker Compose services: `localstack`, `mysql`, `terraform` (one-shot apply), `app-tier`,
`web-tier`, `worker` (scalable), `frontend`. A private Compose network isolates tiers (DB reachable
only from app/worker — SG/NACL stand-in, `§6.4–§6.5`). Env templates define LocalStack endpoint and
non-secret config; secrets via `.env`.

## 12. Testing Strategy (brief §12)

- **Unit**: job state machine, validation schemas, lifecycle-tier logic, auth/RBAC.
- **API**: app-tier endpoints with Supertest (auth, upload validation, RBAC, error shapes).
- **Integration**: against LocalStack — S3 put/get, SQS enqueue/receive, CloudWatch metric filter → alarm, SNS publish.
- **E2E**: login → upload → queue → worker → completed → retrieve (presigned); plus induced-failure → DLQ; plus >50×400 → alarm.

## 13. Mapping to Report Sections

See `RESEARCH_TRACEABILITY.md` for the full matrix (every FR/NFR → proposal § → component → status).
