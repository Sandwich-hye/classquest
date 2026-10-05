# ClassQuest — Cloud Computing Prototype

A working **proof-of-concept** that demonstrates the AWS cloud architecture
proposed in the INFS803 report _Cloud Solution Architecture Report —
On-Premises to AWS Migration: ClassQuest_ (Evans & Bien, S2 2026).

It runs the **real AWS service APIs** (S3, SQS, SNS, CloudWatch, IAM) against
[LocalStack](https://localstack.cloud) in Docker, provisioned with Terraform, so
the proposed architecture can be understood, operated and evaluated end-to-end
**without an AWS account or any cloud cost**.

> This is a research prototype, not a production system. All content is
> synthetic sample data labelled `DEMO/SAMPLE`. It does not prove the research
> hypothesis or contain real users; it demonstrates feasibility of the design.

---

## Research objective

ClassQuest is a K-12 learning platform where **teachers publish** documents,
digital books and videos and **students consume** them. Its legacy on-premises
three-tier deployment has single points of failure, cannot absorb school-hour
traffic spikes, and couples storage to compute. The report proposes a
cloud-native, highly available **three-tier AWS architecture**. This prototype
realises that architecture and demonstrates its key cloud qualities: high
availability, elasticity, security isolation, tiered 5-year retention, and the
report's specific operational alert (**>50 HTTP 400 errors per minute**).

## Architecture overview

```
Browser (React SPA)
      │
      ▼
Web Tier  (single public entry · rate limit · ALB-style access logs)
      │ internal
      ▼
App Tier  (business logic · IAM-role access to cloud · APIs)
   ├── MySQL 8            (Amazon RDS for MySQL stand-in)
   ├── Amazon S3          (media assets + 5-year lifecycle)   ← LocalStack
   └── Amazon SQS ──► Worker(s) ──► S3 / MySQL / CloudWatch   ← LocalStack
                                         │
             CloudWatch Logs ─(filter: HTTP 400)─► Alarm ─► SNS  ← LocalStack
```

Full detail, Mermaid diagrams, and prototype-vs-production fidelity are in
[`ARCHITECTURE.md`](./ARCHITECTURE.md). Requirement-to-code mapping is in
[`RESEARCH_TRACEABILITY.md`](./RESEARCH_TRACEABILITY.md).

## Technology stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + TypeScript |
| Web / App / Worker | Node.js 20 + TypeScript + Express |
| Data tier | MySQL 8 (RDS-for-MySQL stand-in) |
| Cloud APIs | AWS SDK v3 → LocalStack (S3, SQS, SNS, CloudWatch, IAM) |
| IaC | Terraform (dual targets: `localstack` / `aws`) |
| Orchestration | Docker Compose |
| Tests | Vitest |

## Repository structure

```
.
├── apps/frontend/          React SPA (Library · Teacher Portal · Dashboard)
├── services/
│   ├── web-tier/           Public entry: SPA + proxy + ALB-style access logs
│   ├── app-tier/           Business logic API (auth, assets, jobs, dashboard, demo)
│   └── worker/             Async SQS job processor
├── packages/shared/        Cloud clients, auth, domain, DB, logging
├── infra/terraform/        S3/SQS/SNS/CloudWatch/IAM as code
├── sample-data/            Synthetic DEMO/SAMPLE dataset
├── tests/                  unit · api · integration · e2e
├── docs/                   OBSERVABILITY.md
├── .kiro/specs/            requirements · design · tasks
├── ARCHITECTURE.md  RESEARCH_TRACEABILITY.md  SECURITY.md  DEMO.md
└── docker-compose.yml
```

## Prerequisites

- **Docker** + Docker Compose (for the full stack / demo)
- **Node.js 20+** and npm (for building and running tests on the host)
- No AWS account or credentials required.

## Environment variables

Copy the template and adjust if needed (defaults work for the LocalStack demo):

```bash
cp .env.example .env
```

Secrets are **never** committed. `.env.example` contains only dummy LocalStack
values. Key variables: `CLOUD_TARGET`, `AWS_ENDPOINT_URL`, `S3_BUCKET`,
`SQS_QUEUE_NAME`, `MYSQL_*`, `JWT_SECRET`, `HTTP_400_ALARM_THRESHOLD`. See
[`.env.example`](./.env.example) for the full list.

## Run it (LocalStack demo)

```bash
cp .env.example .env
docker compose up -d --build
```

Compose starts LocalStack, MySQL, runs Terraform to provision the cloud
resources, then starts the App Tier, Worker and Web Tier. When healthy:

- Open the app: **http://localhost:8080**
- On the login screen click **Seed demo data**, then sign in (sample
  credentials below).

Scale workers to demonstrate elasticity (report §10.1):

```bash
docker compose up -d --scale worker=3
```

Tear down:

```bash
docker compose down -v
```

## Local development (without Docker for the app code)

```bash
npm install
npm run build            # build shared + services + frontend
# Run LocalStack + MySQL via Docker, then run a service with its env, e.g.:
npm run dev -w @classquest/app-tier
```

## Deploying to real AWS (optional)

```bash
cd infra/terraform
cp aws.tfvars.example aws.tfvars    # edit bucket name + admin email
terraform init
terraform apply -var-file=aws.tfvars
```

Provide credentials via an assumed role / environment — **never hardcode keys**
(report §6.10). Note the real-cloud compute/network layer (VPC, ALB, ASG) is
documented, not fully provisioned here (see `ARCHITECTURE.md` §15).

## Running the tests

```bash
npm test                 # all suites
npm run test:unit        # pure unit tests (no infra needed)
```

- **Unit** tests (job state machine, validation) run anywhere.
- **API / integration / e2e** tests exercise the live stack when it is up
  (`docker compose up -d`), and skip cleanly when it is not.

## Running the demonstration

See [`DEMO.md`](./DEMO.md) for a full scripted walkthrough. In short, from the
**Operations Dashboard** (sign in as teacher or admin) you can:

- **Seed demo data** — loads the labelled sample catalogue.
- **Upload & publish** (Teacher Portal) — watch a job go
  `submitted → queued → processing → completed`.
- **Induce failure → DLQ** — watch retries then `failed`.
- **Simulate Glacier tiering** — watch an asset's S3 tier change.
- **Trigger HTTP-400 burst** — watch the CloudWatch alarm flip to `ALARM`.

Or from the CLI:

```bash
npm run demo:400-burst   # fires 60 HTTP 400s at the Web Tier
```

## Sample credentials (DEMO)

| Role | Email | Password |
|------|-------|----------|
| Teacher | `teacher@classquest.example` | `DemoTeacher123!` |
| Student | `student@classquest.example` | `DemoStudent123!` |
| Admin | `admin@classquest.example` | `DemoAdmin123!` |

These are demo-only accounts seeded by **Seed demo data**. Real deployments load
credentials from AWS Secrets Manager (report §6.10).

## Cloud services used

Amazon S3, Amazon SQS (+DLQ), Amazon SNS, Amazon CloudWatch (Logs, metric
filter, alarm), AWS IAM/STS — all exercised through real SDK calls on
LocalStack. Amazon RDS for MySQL is represented by a MySQL 8 container.

## Estimated cloud resources / cost (production, not incurred)

The report estimates ~**US$5,225/month** (~US$62,700/year) for the full
production AWS footprint (Multi-AZ EC2, RDS, S3+Glacier, ALB/NLB, NAT, SNS,
CloudWatch), reducible ~40–60% with Savings Plans (report §11). **This
prototype incurs no cost** — LocalStack runs locally.

## Known limitations

- RDS is a MySQL 8 container; Multi-AZ failover is simulated, not live.
- Route 53 / NLB / ALB / Auto Scaling / VPC subnets / WAF / Shield are modelled
  in Terraform and behaviour, not provisioned as live AWS resources.
- SNS email delivery is captured by LocalStack, not sent to a real inbox.
- S3 Glacier retrieval latency is not emulated; tier change is reported.
- All data is synthetic `DEMO/SAMPLE`. No real TLS/DNS/billing locally.

Full per-requirement status: [`RESEARCH_TRACEABILITY.md`](./RESEARCH_TRACEABILITY.md).

## Future improvements

- Provision the full `aws` Terraform target (VPC/subnets/ALB/ASG/RDS Multi-AZ).
- Add Amazon CloudFront CDN and evaluate ECS/Fargate + Lambda (report §12.10).
- Replace the lifecycle simulation with real time-based S3 transitions in a
  long-running AWS environment.

## Research traceability

Every requirement maps to a proposal section and a code component in
[`RESEARCH_TRACEABILITY.md`](./RESEARCH_TRACEABILITY.md). The Kiro specifications
under [`.kiro/specs/classquest-prototype/`](./.kiro/specs/classquest-prototype/)
capture requirements, design and tasks.

## License

MIT (prototype / academic use).
