# Research Traceability Matrix

Maps the ClassQuest cloud architecture report (INFS803, Evans & Bien, S2 2026)
to the prototype implementation. Every major decision traces to either a
**proposal section** or an **explicitly documented prototype assumption**.

Status legend: **Implemented** (working in the prototype) · **Simulated**
(behaviour reproduced via a documented stand-in) · **Documented** (described in
IaC/docs, not provisioned locally).

## 1. Business & functional requirements

| # | Research requirement | Source in proposal | Prototype component | Implementation | Status |
|---|----------------------|--------------------|---------------------|----------------|--------|
| FR-1 | Role-scoped authentication (student/teacher/admin) | §2.3.6, §6.1 | `packages/shared/auth/jwt.ts`; app-tier `/auth/login` | JWT + bcrypt + RBAC middleware | Implemented |
| FR-2 | Teacher uploads documents/books/videos | §1.2, §2.3.2 | app-tier `routes/assets.ts`; frontend Teacher Portal | Multipart upload via Web Tier | Implemented |
| FR-3 | Store asset binary in Amazon S3 with typed prefixes | §5.4.2 | `cloud/storage.ts`; Terraform `s3.tf` | Real S3 API on LocalStack; `documents/ videos/` keys | Implemented |
| FR-4 | Persist metadata in managed MySQL (RDS) | §2.3.3, §5.3 | `db/migrate.ts`, `db/repositories.ts` | MySQL 8 container; 5.7-compatible schema | Implemented (DB = container) |
| FR-5 | Asynchronous processing via a queue | §2.3.2, §3.7 | `cloud/queue.ts`; `services/worker` | Real SQS API on LocalStack; job state machine | Implemented |
| FR-6 | Retry then dead-letter failed jobs | §10.10 | SQS redrive (`messaging.tf`); `worker/processor.ts` | maxReceiveCount=3 → DLQ; status=failed | Implemented |
| FR-7 | List & retrieve published assets | §3.7, §4.9.6 | app-tier `/assets`; frontend Library | Presigned S3 GET URLs | Implemented |
| FR-8 | 5-year tiered S3 lifecycle (Standard→Glacier→expire) | §2.3.4, §3.9.4, §5.4.3–5.4.5 | `s3.tf` lifecycle; `/demo/lifecycle-simulate` | Lifecycle rule + on-demand tier simulation | Implemented + Simulated transition |
| FR-9 | Dashboard of real metrics | §7, §15 | app-tier `/dashboard/metrics`; frontend Dashboard | Aggregates MySQL + SQS + CloudWatch | Implemented |
| FR-10 | Alert on >50 HTTP 400/min | §2.2.8, §2.3.1, §3.9.5, §7.6–7.8 | `monitoring.tf`; `cloud/logs.ts`; `/demo/bad-request` | Metric filter + metric data + alarm + SNS all real; `>50/min` breach measured (verified: 62/min). Alarm auto-state-transition needs LocalStack Pro / real AWS. | Implemented (alarm state-transition engine = Community limitation) |
| FR-11 | Demo mode with labelled sample data | brief §18 | app-tier `routes/demo.ts`; `sample-data/` | Seed / induce-failure / lifecycle / 400-burst | Implemented |
| FR-12 | System status / health | §5.1.6, §7 | app-tier `/health`; web-tier `/healthz` | Per-dependency probes, 200/503 | Implemented |

## 2. Non-functional requirements & cloud qualities

| # | Requirement | Source | Prototype component | Implementation | Status |
|---|-------------|--------|---------------------|----------------|--------|
| NFR-1 | High availability / no SPOF | §2.2.3, §3.5, §9.3, §10.3 | Decoupled tiers; Terraform multi-AZ model | Stateless tiers; Multi-AZ documented; failover simulated | Simulated / Documented |
| NFR-2 | Horizontal scalability | §2.2.4, §10.2 | Stateless web/app/worker | Scale by replica count | Implemented |
| NFR-3 | Elasticity under spikes | §2.2.4, §9.4, §10.1 | SQS buffer; `--scale worker=N` | Queue absorbs bursts; add workers | Implemented |
| NFR-4 | Fault tolerance | §5.1.6, §10.10 | Retry/DLQ; error middleware; `/health` | Graceful degradation, 503 | Implemented |
| NFR-5 | Security (authz, least privilege, validation, secrets) | §2.3.6, §6, §12.4 | JWT/RBAC, IAM roles, zod, helmet, env secrets | See `SECURITY.md` | Implemented |
| NFR-6 | Observability | §7, §9.8 | pino logs, CloudWatch metrics/logs, alarm | See `docs/OBSERVABILITY.md` | Implemented |
| NFR-7 | Storage scales independent of compute | §2.3.4, §10.2 | Amazon S3 | Object store decoupled from tiers | Implemented |
| NFR-8 | Reproducibility (IaC, one command) | brief §4, §10 | `docker-compose.yml`, Terraform | `docker compose up` provisions everything | Implemented |
| NFR-9 | Data residency ap-southeast-2 | §2.4, §3.2 | Terraform `aws_region` | Region configured; runs locally | Documented |
| NFR-10 | Cost awareness | §11 | README cost section | Documented, not incurred | Documented |

## 3. AWS service mapping

| Report service | §  | Prototype realisation | Status |
|----------------|----|-----------------------|--------|
| Amazon S3 (+lifecycle, versioning, BPA) | §5.4 | Real S3 API on LocalStack; `s3.tf` | Implemented |
| Amazon SQS (+DLQ) | §3.7, §10.10 | Real SQS API on LocalStack; `messaging.tf` | Implemented |
| Amazon SNS | §7.8 | Real SNS API on LocalStack; publish captured locally | Implemented (delivery simulated) |
| Amazon CloudWatch (logs, metric filter, alarm) | §7.6–7.8 | Real CloudWatch API on LocalStack; `monitoring.tf` | Implemented |
| AWS IAM (roles, least privilege) | §2.3.6, §6.2 | Real IAM on LocalStack; `iam.tf`; STS assume-role | Implemented |
| Amazon RDS for MySQL (Multi-AZ) | §5.3 | MySQL 8 container; failover simulated | Simulated |
| Amazon Route 53 / NLB / ALB | §3.4, §4.7–4.8 | Web Tier gateway + Compose networking; modelled in IaC notes | Simulated / Documented |
| Amazon EC2 Auto Scaling | §5.1.4, §9.4 | Containerised services; replica scaling | Simulated |
| VPC / subnets / SG / NACL | §4, §6.4–6.5 | Compose private network; documented in `ARCHITECTURE.md` | Documented |
| AWS WAF & Shield | §3.8, §6.11 | Web Tier rate limiting + validation stand-in | Simulated / Documented |
| AWS Secrets Manager | §6.10 | Env vars locally; mapping documented | Documented |
| CloudTrail / Config / GuardDuty | §6.13 | Documented only | Documented |

## 4. Documented prototype assumptions

- **A1** All content is synthetic sample data labelled `DEMO/SAMPLE`; no real student data (§2.4; brief §8/§20).
- **A2** RDS → MySQL 8 container; schema MySQL-5.7-compatible (§2.3.3/§5.3.2).
- **A3** SNS email delivery captured by LocalStack, not a real inbox (§7.8).
- **A4** Multi-AZ, Route 53, NLB/ALB, WAF/Shield, Auto Scaling, VPC subnets represented in IaC/behaviour, not as live AWS control-plane resources.
- **A5** No fabricated performance figures or findings; dashboard shows only measured prototype values (brief §20).

## 5. Acceptance-criteria coverage

| AC | Description | Verified by |
|----|-------------|-------------|
| AC-1 | One-command provisioning on LocalStack | `docker compose up` + terraform container |
| AC-2 | Upload → queued → processing → completed → retrieve | e2e `workflow.test.ts`; Teacher Portal |
| AC-3 | Induced failure → DLQ → failed | e2e `workflow.test.ts`; dashboard control |
| AC-4 | >50 HTTP 400/min → alarm + SNS | e2e `workflow.test.ts`; `http400-burst.js` |
| AC-5 | Dashboard shows real (not hardcoded) values | `dashboard.ts` aggregation; integration tests |
| AC-6 | Lifecycle Standard → Glacier observable | `/demo/lifecycle-simulate`; `storage.ts` |
| AC-7 | This traceability matrix | this file |
| AC-8 | Unit + API + integration + e2e tests pass | `npm test` (32 tests) |
