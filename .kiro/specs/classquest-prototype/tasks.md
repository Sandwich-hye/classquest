# ClassQuest Cloud Prototype — Implementation Tasks

> Incremental plan. Each task cites the requirements (FR/NFR) and report sections it satisfies.

## Phase 3 — Skeleton
- [ ] T1. Monorepo layout: `packages/shared`, `services/{web-tier,app-tier,worker}`, `apps/frontend`, `infra/terraform`, `sample-data`, `tests`, `docs`. Root `package.json` (workspaces), `tsconfig.base.json`, `.gitignore`, `.env.example`, `docker-compose.yml`. (NFR-8)

## Phase 4 — Core workflow (local, real cloud APIs)
- [ ] T2. `packages/shared`: config, logger, AWS SDK clients (LocalStack endpoint), domain models + Job state machine + zod schemas, MySQL pool + migrate/seed. (FR-4/5, §5.3)
- [ ] T3. Cloud services: StorageService (S3), QueueService (SQS+DLQ), MetricsService + AccessLogService (CloudWatch), AlertService (SNS). (FR-3/5/8/10, §5.4/§3.7/§7)
- [ ] T4. App Tier: auth/login, assets upload→S3+enqueue, list/get+presigned, jobs, dashboard metrics, health, demo endpoints. (FR-1,2,3,4,5,7,9,11,12)
- [ ] T5. Worker: SQS long-poll, state transitions, metrics, retry/DLQ, MySQL updates. (FR-5/6, NFR-3/4)
- [ ] T6. Web Tier: serve SPA, JWT gate, rate limit, proxy to App Tier, ALB-style access logs. (FR-1/10, §4.8/§6.11)

## Phase 5 — Cloud integration (IaC)
- [ ] T7. Terraform: S3+lifecycle+versioning+BPA, SQS+DLQ, SNS, CloudWatch log group+metric filter+alarm, IAM roles/policies; `localstack` + `aws` var files; one-shot apply container. (FR-3,5,8,10, NFR-5/6, §3.9/§5.4/§7)

## Phase 6 — Security
- [ ] T8. JWT+bcrypt+RBAC, least-privilege IAM wiring, input validation, rate limiting, sanitized errors, secrets via env, Block Public Access + presigned-only. (NFR-5, §6)

## Phase 7 — Observability
- [ ] T9. CloudWatch metrics/logs, HTTP-400 metric filter→alarm→SNS end-to-end, `/health`, `/dashboard/metrics` real aggregation. (FR-9/10/12, NFR-6, §7)

## Phase 8 — Frontend
- [ ] T10. React SPA: login, student Library/My Learning, Teacher Portal upload+live job states, Admin Dashboard (metrics/jobs/storage tiers/alerts/status), demo controls. Brand styling. (FR-1,2,7,9,11)

## Phase 9 — Tests
- [ ] T11. Unit (state machine, schemas, lifecycle, RBAC); API (endpoints); integration (LocalStack S3/SQS/CW/SNS); e2e (upload→complete→retrieve; failure→DLQ; 400 burst→alarm). (brief §12, AC-8)

## Phase 10 — Docs & demo readiness
- [ ] T12. `ARCHITECTURE.md` (+Mermaid: context, cloud, data-flow, sequence, deployment). (brief §10)
- [ ] T13. `RESEARCH_TRACEABILITY.md` matrix. (brief §9)
- [ ] T14. `README.md` (overview, stack, structure, prerequisites, env, local dev, LocalStack deploy, tests, demo, cloud services, cost notes, limitations, future work). (brief §19)
- [ ] T15. Demo mode script + labelled sample data; verify AC-1..AC-8 end-to-end; cleanup temp files. (brief §18, §21)

## Status legend
Implemented / Partial / Planned — tracked in `RESEARCH_TRACEABILITY.md`.
