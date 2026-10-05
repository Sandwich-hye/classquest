# ClassQuest Cloud Prototype — Requirements Specification

> **Source of truth:** _Cloud Solution Architecture Report — On-Premises to AWS Migration: ClassQuest_
> (INFS803 Cloud Computing, S2 2026, Evans & Bien). Section references below (e.g. `§2.3.1`) point
> into that report. This prototype is a **research proof-of-concept**, not a production system.

## 1. Research Problem (from proposal §1.2–§1.3, §2.1)

ClassQuest is a K-12 ed-tech platform (freemium) that lets teachers distribute documents, digital
books and educational videos, and tracks student progress. Its legacy **three-tier on-premises**
deployment (4 Web nodes, 4 App nodes, 2 DB nodes, single-node HAProxy load balancers, manual DBA
ops) suffers from:

- Single points of failure (single-node HAProxy, standalone MySQL cluster) — `§2.1.1`, `§2.2.3`.
- Inability to scale with school-schedule-driven traffic spikes (08:30 login surge) — `§2.2.4`.
- Tightly coupled compute + storage; low off-peak utilisation — `§2.1.5`.
- High CapEx, manual infrastructure management — `§2.1.5`, `§11.15`.

## 2. Proposed Solution (proposal §3)

A cloud-native, highly available **three-tier AWS architecture** inside an isolated VPC: public
load balancing (Route 53 → NLB → ALB), decoupled Web and Application tiers on EC2 Auto Scaling
Groups in private subnets, Amazon RDS for MySQL Multi-AZ, Amazon S3 object storage with lifecycle
tiering, credential-less IAM access, and CloudWatch/SNS monitoring. The **central research
contribution** is this architecture and the demonstration that it delivers the required cloud
qualities (HA, elasticity, security isolation, tiered retention, observability).

## 3. Prototype Objective

Produce a **working, demonstrable** system that lets an evaluator understand, interact with, and
observe the proposed architecture: run the main workflow, see real inputs/outputs, watch cloud
components interact, and evaluate feasibility — using **real AWS service APIs via LocalStack**.

## 4. Actors (proposal §1.2, §2.3)

| Actor | Description | Source |
|-------|-------------|--------|
| Student | Browses/consumes published learning assets; sees own progress | §1.2 |
| Teacher | Uploads & publishes documents, books, videos; tracks a cohort | §1.2, §2.3.2 |
| Administrator | Monitors system health; receives HTTP-400 alerts | §2.2.8, §7.8 |
| Web Tier (service principal) | Presentation/edge; forwards to App Tier | §3.4, §2.3.1 |
| Application Tier (service principal) | Business logic; S3/RDS access via IAM role | §3.4, §2.3.2 |
| Worker (service principal) | Async asset processing | derived from §2.3.2 (queue depth), §12.10 |

## 5. Functional Requirements

| ID | Requirement | Proposal |
|----|-------------|----------|
| FR-1 | A user can authenticate and receive a role-scoped session (student/teacher/admin). | §2.3.6 (zero-trust), §6.1 |
| FR-2 | A teacher can upload an educational asset (document / book / video) through the Web Tier. | §1.2, §2.3.4, §5.4 |
| FR-3 | The Application Tier stores the asset binary in **Amazon S3** under a typed key prefix (`documents/`, `pictures/`, `videos/`). | §5.4.2 |
| FR-4 | Asset metadata (owner, type, size, status, storage class) is persisted in **MySQL** (RDS-equivalent). | §2.3.3, §5.3 |
| FR-5 | Asset processing is **asynchronous via a queue (Amazon SQS)**; jobs move through `submitted → queued → processing → completed`/`failed`. | §2.3.2 (queue depth), §3.7 |
| FR-6 | Failed jobs are retried and, after max attempts, routed to a **dead-letter queue**; the failure is surfaced in the UI. | §10.10 fault tolerance, §13 (error handling brief) |
| FR-7 | Students/teachers can **list and retrieve** published assets (presigned S3 access). | §3.7 step 5, §4.9 step 6 |
| FR-8 | S3 objects carry a **lifecycle policy**: Standard for 90 days → Glacier Flexible Retrieval → expire at 1825 days. The prototype exposes each object's current tier. | §2.3.4, §3.9.4, §5.4.3–§5.4.5 |
| FR-9 | A **dashboard** shows real metrics: requests processed, success/fail counts, avg processing time, current jobs, storage-tier breakdown, system status, recent cloud events. | §7, §15 (dashboard-worthy metrics) |
| FR-10 | The system raises an **alert when HTTP 400 errors exceed 50 per minute**, via a CloudWatch metric filter → alarm → SNS topic (email in prod; captured locally in the prototype). | §2.2.8, §2.3.1, §3.9.5, §7.6–§7.8 |
| FR-11 | A **demo mode** seeds sample data and can trigger both a successful run and an induced failure / HTTP-400 burst, with all demo data clearly labelled. | brief §18 |
| FR-12 | A **system-status / health endpoint** reports the health of each tier and each cloud dependency. | §5.1.6 health checks, §7 |

## 6. Non-Functional Requirements

| ID | Category | Requirement | Proposal |
|----|----------|-------------|----------|
| NFR-1 | High Availability | Components are decoupled so one tier's failure does not cascade; architecture is multi-AZ in design and the prototype documents + simulates AZ failover. | §2.2.3, §3.5, §9.3, §10.3 |
| NFR-2 | Scalability | Web and App tiers are stateless and horizontally scalable; adding workers increases throughput without code change. | §2.2.4, §2.3.2, §10.2 |
| NFR-3 | Elasticity | Async queue absorbs spikes; worker count can scale with queue depth (demonstrated by running N workers). | §2.2.4, §9.4, §10.1 |
| NFR-4 | Fault Tolerance | Meaningful error handling + retry + DLQ for processing; health-check-driven replacement is documented. | §5.1.6, §10.10 |
| NFR-5 | Security | JWT auth + RBAC for humans; **credential-less IAM roles** for service→S3/queue; least privilege; input validation; no hardcoded secrets; sanitized errors; TLS in prod. | §2.3.6, §6, §12.4 |
| NFR-6 | Observability | Structured logs → CloudWatch Logs; custom metrics; the HTTP-400 metric filter + alarm; status endpoint. | §7, §9.8 |
| NFR-7 | Storage Scaling | Object storage scales independently of compute; capacity is not tied to instances. | §2.3.4, §10.2 |
| NFR-8 | Reproducibility | Entire stack starts with one command (Docker Compose + Terraform apply against LocalStack); no AWS account/credentials/cost required for the demo. | brief §4, §10 |
| NFR-9 | Data Residency (noted) | Prod targets `ap-southeast-2` (Sydney) for trans-Tasman privacy; prototype records the region config but runs locally. | §2.4, §3.2 |
| NFR-10 | Cost Awareness (noted) | Prod cost model and lifecycle-driven savings are documented, not incurred. | §11 |

## 7. Cloud Service Mapping (what runs where in the prototype)

| Report service | Prototype realisation | Fidelity |
|----------------|-----------------------|----------|
| Amazon S3 + lifecycle + versioning | **Real S3 API on LocalStack**, lifecycle rule via Terraform; tier transition demonstrated by a lifecycle-simulation command. | High |
| Amazon SQS (queue decoupling) | **Real SQS API on LocalStack** + DLQ. | High |
| Amazon SNS (admin email alerts) | **Real SNS API on LocalStack**; email delivery captured locally (LocalStack records the publish). | High (delivery mocked) |
| Amazon CloudWatch Logs + metric filter + alarm | **Real CloudWatch Logs/metrics/alarms on LocalStack**; metric filter counts HTTP 400. | High |
| AWS IAM roles / instance profiles / least privilege | **Real IAM roles+policies on LocalStack**; services assume roles for credential-less access. | High |
| Amazon RDS for MySQL (Multi-AZ) | **MySQL 8 container** (LocalStack Community does not emulate RDS instances). Multi-AZ failover is simulated + documented. | Medium — documented substitution |
| Route 53 / NLB / ALB | **Docker Compose networking + an internal HTTP gateway**; ALB access-log format reproduced for the 400 metric filter. | Medium — behaviour preserved |
| EC2 Auto Scaling Groups | **Containerised Web/App/Worker services**, scaled by replica count. | Medium — behaviour preserved |
| VPC / subnets / SG / NACL | **Documented** in Terraform (aws target) + Compose network isolation locally. | Design-level |
| AWS WAF / Shield | **Documented**; app-level rate limiting + input validation stand in locally. | Design-level |

## 8. Explicit Assumptions / Simplifications (brief §4, §8, §20)

- A1. Sample/synthetic learning assets are used; all demo content is labelled `DEMO/SAMPLE` and is not real student data.
- A2. The DB engine is MySQL 8 in a container rather than a managed RDS instance; schema is MySQL-5.7-compatible per `§2.3.3`/`§5.3.2`.
- A3. SNS email delivery is captured by LocalStack rather than sent to a real inbox.
- A4. Multi-AZ, Route 53, NLB/ALB, WAF/Shield, Auto Scaling are represented behaviourally and in IaC, not as live AWS control-plane resources.
- A5. No fabricated performance figures or research findings; dashboard shows only measured prototype values, labelled as prototype results.

## 9. Out of Scope

- Real billing/cost; real DNS; real TLS certificates (self-signed/http locally).
- Full learning-management features (quizzes grading engine, gamification XP math) beyond what is needed to demonstrate the asset-distribution workflow and dashboards.
- Production hardening (secrets rotation cadence, HA control plane, DR drills) — documented, not implemented.

## 10. Acceptance Criteria (how we know the prototype meets the brief)

- AC-1. `docker compose up` + `terraform apply` provisions all cloud resources on LocalStack with no AWS account.
- AC-2. A teacher login can upload an asset and watch it move `submitted → queued → processing → completed`, with the object visible in S3 and metadata in MySQL.
- AC-3. An induced failure routes a job to the DLQ and the UI shows `failed`.
- AC-4. Generating >50 HTTP 400s in a minute produces a CloudWatch alarm and an SNS publish captured locally.
- AC-5. The dashboard reflects real counts/latency/storage-tier data, not hardcoded numbers.
- AC-6. The lifecycle-simulation command moves an aged object's reported tier from `STANDARD` to `GLACIER`.
- AC-7. `RESEARCH_TRACEABILITY.md` maps every FR/NFR to a proposal section and a code component.
- AC-8. Unit + API + integration + one e2e test pass.
