# ClassQuest — Cloud Computing Prototype

A working **proof-of-concept** of the AWS cloud architecture proposed in the
INFS803 report _Cloud Solution Architecture Report — On-Premises to AWS
Migration: ClassQuest_ (Evans & Bien, S2 2026).

ClassQuest is a K-12 learning platform: **teachers publish** documents, digital
books and videos, and **students open** them. The prototype runs the real AWS
service APIs (S3, SQS, SNS, CloudWatch, IAM/STS) against
[LocalStack](https://localstack.cloud) in Docker, provisioned with Terraform,
so the architecture can be operated and evaluated **without an AWS account or
any cloud cost**.

> Research prototype, not a production system. All content is synthetic
> `DEMO/SAMPLE` data. It demonstrates the feasibility of the design; it does not
> prove the research hypothesis.

---

## Quick start

Prerequisites: **Docker Desktop** (with Docker Compose) and **Node.js 20+**
(Node is only needed to run the automated tests on the host). No AWS account.

**1. Clone and install**

```bash
git clone https://github.com/Sandwich-hye/classquest.git
cd classquest
npm ci            # host-side tooling for tests/lint; the stack itself builds in Docker
```

**2. Configure `.env`** — the defaults work for the LocalStack demo as-is.

```bash
cp .env.example .env              # Windows PowerShell: Copy-Item .env.example .env
```

**3. Start the stack**

```bash
docker compose up -d --build
docker compose ps                 # wait until app-tier and web-tier are "healthy"
```

Compose starts LocalStack and MySQL, runs Terraform once to provision the cloud
resources, then starts the App Tier (which migrates the database and creates
the demo accounts), the Worker and the Web Tier. The first run takes a few
minutes.

**4. Open ClassQuest** at **http://localhost:8080**

**5. Sign in with a demo account** (created automatically when `DEMO_MODE=true`,
the default for LocalStack):

| Role | Email | Password | Lands on |
|------|-------|----------|----------|
| Student | `student@classquest.example` | `DemoStudent123!` | Home |
| Teacher | `teacher@classquest.example` | `DemoTeacher123!` | Dashboard |
| Admin | `admin@classquest.example` | `DemoAdmin123!` | Operations |

**6. Demonstrate the main cloud workflow**

1. As the **teacher**, open **Operations → Demonstration Controls → Seed demo
   catalogue** (or run `npm run demo:seed`).
2. **Publish Resource**: pick a type, add a title and a file, upload, and watch
   the pipeline go *Submitted → Queued → Processing → Completed*.
3. Sign in as the **student**, open a resource from **Library**, then check
   **My Progress**.
4. Back in **Operations** as the teacher: *Induce processing failure*
   (retries → failed → DLQ), *Simulate Glacier lifecycle*, *Generate HTTP 400
   burst*.

The full scripted walkthrough is in [`DEMO.md`](./DEMO.md); the Windows
acceptance checklist is in [`docs/LOCAL_ACCEPTANCE.md`](./docs/LOCAL_ACCEPTANCE.md).

**7. Shut down / reset**

```bash
docker compose down        # stop, keep data
docker compose down -v     # stop and delete all data (MySQL + LocalStack)
```

---

## What the prototype does

| Role | Pages | What they can do |
|------|-------|------------------|
| Student | Home · Library · My Progress | Browse and open **completed** resources; see which resources they have opened |
| Teacher | Dashboard · Library · Publish Resource · Operations | Publish resources, watch processing, see library-wide pipeline state, run demo controls |
| Admin | Operations · Library | System health, monitoring and demo controls; browse the library |

Wrong-role routes redirect to the role's own landing page. The **backend** is
the real security boundary: every API route checks the JWT and role.

**My Progress means "resources opened"** — recorded when a student obtains a
download link for a completed resource. It does not represent grades, mastery
or lesson completion.

## Architecture

```
Browser (React SPA)
      │  http://localhost:8080
      ▼
Web Tier   serves the SPA · rate limiting · ALB-style access logs → CloudWatch Logs
      │    proxies /api/* (does not check JWTs itself)
      ▼
App Tier   JWT + role checks · validation · business logic
   ├── MySQL 8        users, assets, jobs, request metrics, resource_access
   ├── Amazon S3      resource files (presigned download links)        ← LocalStack
   └── Amazon SQS ──► Worker(s) ──► S3 read · MySQL status · CloudWatch metrics
          └── DLQ (native redrive after 3 receives)                    ← LocalStack
CloudWatch Logs ─ metric filter (HTTP 400) ─► Alarm ─► SNS              ← LocalStack
```

### Implemented in this prototype

- Three tiers plus a horizontally scalable worker, in Docker Compose.
- S3, SQS (+DLQ), SNS, CloudWatch Logs/metrics/alarm and IAM roles provisioned
  by **Terraform on LocalStack** (`infra/terraform`), exercised through real
  AWS SDK calls. MySQL 8 container stands in for RDS.
- JWT authentication, role-based authorisation, input validation, presigned S3
  access, retry + dead-letter handling, health checks, real measured metrics.

### Production AWS architecture described in the assignment report

The report's VPC with public/private subnets across two AZs, Route 53, NLB/ALB,
EC2 Auto Scaling, RDS Multi-AZ, NAT gateways, WAF/Shield, Secrets Manager and
CloudTrail are **documented, not provisioned**. This repository's Terraform
creates only the S3, SQS, SNS, CloudWatch and IAM resources listed above. See
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

### Known local limitations

- **CloudWatch alarm:** LocalStack Community does not evaluate alarm state from
  metric data, so the HTTP 400 alarm is not expected to move to `ALARM`
  locally. Operations shows the App Tier's own 400 count and labels this.
- **SNS:** the alarm → SNS path is the production design; email is never sent
  locally.
- **Glacier:** the 90-day lifecycle rule is configured, but locally the
  *Simulate Glacier lifecycle* control rewrites objects with the `GLACIER`
  storage class on demand. Restore/retrieval latency is not emulated.
- **IAM:** roles and policies are created, but LocalStack Community does not
  enforce IAM, and the app role does not yet list every action the app uses
  (see [`SECURITY.md`](./SECURITY.md)).
- **RDS:** a single MySQL container; Multi-AZ failover is described, not run.

## Repository structure

```
apps/frontend/        React SPA (Vite + TypeScript)
services/web-tier/    Public entry: SPA, rate limit, access logs, /api proxy
services/app-tier/    API: auth, assets, jobs, dashboard metrics, /me/progress, demo
services/worker/      SQS consumer: processing, retries, DLQ via redrive
packages/shared/      Config, logging, domain, DB + migrations, auth, AWS clients
infra/terraform/      S3 / SQS / SNS / CloudWatch / IAM (LocalStack or AWS target)
sample-data/          Synthetic DEMO/SAMPLE users and catalogue
tests/                unit · api · integration · e2e (+ helper scripts)
docs/                 OBSERVABILITY.md · LOCAL_ACCEPTANCE.md
```

## Testing

| Suite | Files | Needs | Covers |
|-------|-------|-------|--------|
| **Unit** | `tests/unit` | nothing | Job state machine, schemas, worker idempotency and redrive contract, publish write order, route authorisation (in-process App Tier), demo gating and seed locking, open tracking, frontend route guards and view logic |
| **API** | `tests/api` | App Tier | Logins for all roles, invalid/expired tokens, role matrix, validation, demo auth, progress endpoint |
| **Integration** | `tests/integration/stack.test.ts`, `cloud.test.ts` | App Tier, LocalStack, MySQL | Terraform resources (redrive, SNS, alarm, metric filter); upload of document/book/video verified in S3 and MySQL; validation stores nothing; duplicate SQS delivery; library visibility and filters; presigned download bytes; `resource_access` rows and `/me/progress` vs the database; queue depth, storage tiers and alarm state vs SQS/MySQL/CloudWatch; Glacier simulation (incl. re-run); concurrent seeding |
| **E2E** | `tests/e2e` | Web Tier, App Tier, LocalStack | Through the public entry: SPA deep links and branding, upload → completed → student download, induced failure → retries → **real DLQ**, HTTP 400 burst → measured breach and CloudWatch access-log events |
| **Database** (opt-in) | `tests/integration/progressDb.test.ts` | a disposable MySQL database | Migration idempotency, `resource_access` aggregate, student isolation, named-lock serialisation |

```bash
npm run test:unit         # no Docker needed
npm run test:all          # everything; live suites are SKIPPED (with a reason) if the stack is down
npm run test:acceptance   # live suites only; FAILS if any required service is unreachable
npm run test:api | test:integration | test:e2e
```

- Live suites never pass by returning early: they are reported as **skipped**
  with a `[SKIPPED] … not reachable` notice, or — under `test:acceptance` —
  **fail**.
- Test files run one at a time because the live suites share one stack.
- The database suite runs only when `TEST_MYSQL_DATABASE` names a disposable
  database (it deletes rows); see `docs/LOCAL_ACCEPTANCE.md`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Build all workspaces |
| `npm run typecheck` | Type-check shared, app-tier, web-tier, worker |
| `npm run lint` | ESLint (TypeScript) |
| `npm test` / `test:all` | All suites; live suites skipped with a reason if the stack is down |
| `npm run test:unit` / `test:api` / `test:integration` / `test:e2e` | One suite |
| `npm run test:acceptance` | Live suites only; fails if the Docker stack is unreachable |
| `npm run stack:up` / `stack:down` / `stack:logs` | `docker compose up -d --build` / `down -v` / `logs -f` |
| `npm run stack:scale-workers` | Run 3 workers (elasticity demo) |
| `npm run demo:seed` | Seed the demo catalogue through the running stack |
| `npm run demo:400-burst` | Send 60 HTTP 400s through the Web Tier |

## Environment

`.env.example` documents every variable; the defaults suit LocalStack. Key
ones: `CLOUD_TARGET`, `AWS_ENDPOINT_URL`, `S3_BUCKET`, `SQS_QUEUE_NAME`,
`MYSQL_*`, `JWT_SECRET`, `DEMO_MODE`, `HTTP_400_ALARM_THRESHOLD`,
`WORKER_RETRY_DELAY_SECONDS`. Secrets are never committed; `.env` is
git-ignored.

## Estimated production cost (not incurred)

The report estimates ~**US$5,225/month** for the full production footprint,
reducible ~40–60% with Savings Plans (report §11). This prototype runs locally
and incurs no cloud cost.

## Further documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — design, diagrams, prototype vs production
- [`DEMO.md`](./DEMO.md) — scripted demonstration
- [`docs/LOCAL_ACCEPTANCE.md`](./docs/LOCAL_ACCEPTANCE.md) — Windows acceptance checklist
- [`SECURITY.md`](./SECURITY.md) — controls and known gaps
- [`docs/OBSERVABILITY.md`](./docs/OBSERVABILITY.md) — logs, metrics, alerting
- [`RESEARCH_TRACEABILITY.md`](./RESEARCH_TRACEABILITY.md) — requirement → code mapping

## License

MIT (prototype / academic use).
