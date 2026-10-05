# ClassQuest Cloud Prototype — Architecture

> A research proof-of-concept realising the AWS cloud architecture from the INFS803 report
> _Cloud Solution Architecture Report — On-Premises to AWS Migration: ClassQuest_ (Evans & Bien,
> S2 2026). It runs the **real AWS service APIs on LocalStack**, so the architectural behaviour is
> exercised without an AWS account or cost. Section references (`§`) point into the source report.

---

## 1. System Overview

ClassQuest is a K-12 learning platform where **teachers publish** documents, digital books and
videos, and **students consume** them and track progress (`§1.2`). The source report proposes
migrating ClassQuest's legacy, single-points-of-failure, fixed-capacity three-tier on-premises
deployment to a highly available, elastic, secure AWS three-tier architecture (`§1.3`, `§3`).

This prototype demonstrates that architecture end-to-end: a decoupled **Web Tier → Application
Tier → Data Tier (MySQL + S3) with an asynchronous SQS processing pipeline**, credential-less IAM
access, lifecycle-tiered object storage, and CloudWatch→SNS monitoring (including the specific
"more than 50 HTTP 400 errors per minute" alert, `§2.2.8`).

---

## 2. Architectural Drivers

| Driver | Source | How the architecture responds |
|--------|--------|-------------------------------|
| Eliminate single points of failure | `§2.2.3` | Decoupled stateless tiers; multi-AZ design; RDS Multi-AZ; managed LB. |
| Handle school-schedule traffic spikes | `§2.2.4`, `§2.3.1` | Horizontally scalable tiers + async queue absorbing bursts. |
| Scale storage independently of compute | `§2.1.5`, `§2.3.4` | S3 object storage decoupled from EC2. |
| 5-year tiered retention | `§2.2.5`, `§5.4` | S3 lifecycle: Standard → Glacier @90d → expire @1825d. |
| Credential-less, least-privilege access | `§2.3.6`, `§6.2` | IAM roles per service; Web read-only, App read/write. |
| Alert on >50 HTTP 400 / min | `§2.2.8`, `§7.6` | CloudWatch Logs metric filter → alarm → SNS. |
| Reproducibility / IaC | `§2.7` | Terraform; one-command Docker Compose stack. |

---

## 3. System Context Diagram

```mermaid
graph TD
    student["Student<br/>(browse / consume)"]
    teacher["Teacher<br/>(upload / publish)"]
    admin["Administrator<br/>(monitor / alerts)"]

    subgraph CQ["ClassQuest Cloud System (prototype)"]
        sys["Three-tier platform<br/>Web → App → Data + async pipeline"]
    end

    sns["📧 Email / SNS<br/>(admin alerting)"]
    s3ext["Object storage lifecycle<br/>(Standard → Glacier)"]

    student -->|"HTTPS: browse, retrieve assets"| sys
    teacher -->|"HTTPS: upload documents/books/videos"| sys
    admin -->|"HTTPS: dashboard, system status"| sys
    sys -->|"HTTP 400 spike alert"| sns
    sns -->|"notify"| admin
    sys -->|"tier aged objects"| s3ext
```

---

## 4. Logical Architecture (three-tier, decoupled — §3.4)

```mermaid
graph TD
    spa["React SPA<br/>(Library / Teacher Portal / Admin)"]

    subgraph web["Presentation / Web Tier (§3.4, §4.8)"]
        gw["Gateway + Web service<br/>JWT gate · rate limit (WAF stand-in)<br/>ALB-style access logs"]
    end

    subgraph app["Application Tier (§3.4)"]
        api["Business logic API<br/>assets · jobs · dashboard · auth<br/>IAM role → S3/SQS/CW"]
    end

    subgraph data["Data Tier"]
        mysql[("MySQL 8<br/>RDS-for-MySQL stand-in<br/>§5.3")]
        s3[("Amazon S3<br/>media assets + lifecycle<br/>§5.4")]
    end

    q["Amazon SQS<br/>asset-processing + DLQ<br/>§3.7, §10.10"]
    worker["Worker(s)<br/>async processing<br/>scales by replicas"]
    cw["CloudWatch Logs + Metrics<br/>metric filter: HTTP400ErrorCount<br/>§7.6"]
    alarm["CloudWatch Alarm<br/>>50 / min → §7.7"]
    sns["Amazon SNS<br/>classquest-admin-alerts §7.8"]

    spa --> gw --> api
    api --> mysql
    api --> s3
    api -->|enqueue job| q
    q --> worker
    worker --> s3
    worker --> mysql
    worker --> cw
    gw -->|access logs| cw
    cw --> alarm --> sns
```

---

## 5. Physical / Cloud Architecture (maps to §3.4, Figure 3)

```mermaid
graph TB
    users["Users (AU / NZ)"]

    subgraph region["AWS Region ap-southeast-2 (Sydney) — prod target §3.2"]
        r53["Amazon Route 53<br/>latency alias §4.7"]
        nlb["Network Load Balancer<br/>L4 / TCP §3.4"]
        palb["Public ALB<br/>L7 HTTP/HTTPS · TLS term §4.8"]

        subgraph vpc["VPC 10.0.0.0/16 §4.1"]
            subgraph az_a["AZ ap-southeast-2a"]
                pub_a["Public subnet 10.0.1.0/24<br/>ALB · NAT GW"]
                webapp_a["Private app subnet 10.0.10.0/24<br/>Web + App EC2 (ASG)"]
                db_a["Private DB subnet 10.0.100.0/24<br/>RDS primary"]
            end
            subgraph az_b["AZ ap-southeast-2b"]
                pub_b["Public subnet 10.0.2.0/24<br/>ALB · NAT GW"]
                webapp_b["Private app subnet 10.0.20.0/24<br/>Web + App EC2 (ASG)"]
                db_b["Private DB subnet 10.0.200.0/24<br/>RDS standby"]
            end
            ialb["Internal ALB §3.4"]
        end

        s3["Amazon S3 (lifecycle) §5.4"]
        sqs["Amazon SQS (+DLQ)"]
        cw["CloudWatch"]
        sns["SNS"]
        iam["IAM roles §6.2"]
    end

    users --> r53 --> nlb --> palb --> webapp_a
    palb --> webapp_b
    webapp_a --> ialb --> webapp_b
    webapp_a --> db_a
    db_a <-->|"sync replication (Multi-AZ)"| db_b
    webapp_a --> s3
    webapp_a --> sqs --> webapp_b
    webapp_a --> cw --> sns
    iam -.->|"temporary creds"| webapp_a

    classDef note fill:#eef,stroke:#88a;
```

**Prototype realisation:** the VPC/subnet/AZ/Route53/NLB/ALB/ASG layer is represented by Docker
Compose networking + an internal gateway and is fully described in Terraform for the `aws` target;
S3, SQS, SNS, CloudWatch and IAM run as **real APIs on LocalStack**; RDS is a MySQL 8 container.
See `README.md` §"Prototype vs Production fidelity".

---

## 6. Data Flow Diagram (upload → process → retrieve)

```mermaid
flowchart LR
    A["Teacher selects file<br/>+ title + type"] --> B["Web Tier<br/>authn + validate + log"]
    B --> C["App Tier<br/>validate (zod)"]
    C --> D[["S3 putObject<br/>key: type/uuid §5.4.2"]]
    C --> E[["MySQL insert asset<br/>status=submitted"]]
    C --> F[["SQS enqueue job"]]
    F --> G["Worker receive"]
    G --> H["process<br/>(extract metadata / thumbnail stub)"]
    H -->|ok| I[["MySQL status=completed<br/>CloudWatch SuccessCount"]]
    H -->|error ≥ max| J[["SQS → DLQ<br/>MySQL status=failed §10.10"]]
    I --> K["Student lists & opens asset"]
    K --> L[["S3 presigned GET §4.9.6"]]
```

---

## 7. Sequence Diagram — primary end-to-end workflow (§3.7)

```mermaid
sequenceDiagram
    actor T as Teacher
    participant W as Web Tier
    participant A as App Tier
    participant S as S3 (LocalStack)
    participant DB as MySQL
    participant Q as SQS
    participant K as Worker
    participant C as CloudWatch
    participant N as SNS

    T->>W: POST /assets (file, JWT)
    W->>W: verify JWT, rate-limit, access-log
    W->>A: proxy POST /assets
    A->>A: validate input
    A->>S: putObject(type/uuid)
    A->>DB: insert asset (submitted)
    A->>Q: enqueue job
    A-->>W: 202 {assetId, jobId}
    W-->>T: 202 Accepted

    K->>Q: long-poll receive
    Q-->>K: job message
    K->>DB: state=processing
    K->>S: read/process object
    alt success
        K->>DB: state=completed
        K->>C: SuccessCount, ProcessingTimeMs
    else failure (attempts >= max)
        K->>Q: leave → redrive to DLQ
        K->>DB: state=failed
        K->>C: FailureCount
    end

    Note over W,C: every request → ALB-style access log in CloudWatch
    C->>C: metric filter counts status_code=400
    C->>N: alarm when >50/min (§7.7)
    N-->>T: (admin) email alert (captured locally)
```

---

## 8. Deployment Diagram (prototype runtime — §11)

```mermaid
graph TD
    subgraph host["Developer host / CI"]
        subgraph dc["Docker Compose network (tier isolation = SG/NACL stand-in §6.4)"]
            ls["localstack<br/>S3·SQS·SNS·CloudWatch·IAM"]
            tf["terraform (one-shot apply)"]
            my["mysql:8"]
            at["app-tier (Node)"]
            wt["web-tier (Node) + static SPA"]
            wk["worker (Node) ×N replicas"]
        end
    end
    browser["Browser"] --> wt --> at
    at --> my
    at --> ls
    wk --> ls
    wk --> my
    tf --> ls
```

---

## 9. Component Descriptions

| Component | Responsibility | Report § |
|-----------|----------------|----------|
| `apps/frontend` | React SPA; role-based UI; dashboard. | §15 metrics |
| `services/web-tier` | Public entry; JWT gate; rate limit; proxy; ALB-style access logs. | §4.8, §6.11, §7.6 |
| `services/app-tier` | Business logic; S3/SQS/MySQL via IAM role; APIs; demo mode. | §3.4, §6.2 |
| `services/worker` | Async job processor; state machine; retry/DLQ; metrics. | §3.7, §10.10 |
| `packages/shared` | Cloud service clients, auth, domain, DB, logging. | §6, §7 |
| `infra/terraform` | S3/SQS/SNS/CloudWatch/IAM as code; dual targets. | §2.7, §3.9 |

---

## 10. Security Architecture (§6, NFR-5)

- **Human auth**: JWT (short expiry) + bcrypt + RBAC (`student`/`teacher`/`admin`).
- **Service auth**: IAM role assumption → temporary creds; **no static keys in code** (`§6.10`).
- **Least privilege**: Web role = `s3:GetObject` + `logs:PutLogEvents`; App role adds `s3:Put*`,
  `sqs:*` (scoped), `cloudwatch:PutMetricData` — mirrors `§2.3.6` web-read / app-write split.
- **Network isolation**: Compose private network; DB reachable only from app/worker (SG/NACL
  stand-in, `§6.4–§6.5`). Terraform models private subnets + tiered SGs for the `aws` target.
- **Input validation** (zod) + file type/size allow-list on every endpoint (`§13`).
- **Edge protection**: Web Tier rate limiting as WAF/Shield stand-in (`§6.11`).
- **Data protection**: S3 Block Public Access + presigned-URL-only retrieval (`§5.4.7`); SSE and
  TLS 1.3 documented for prod (`§6.8`, `§6.12`).
- **Sanitized errors**: client sees `{code,message,requestId}`; internals only in logs (`§6`).

---

## 11. Scalability & Elasticity Approach (§10.1–§10.2, NFR-2/3)

- Web/App/Worker are **stateless** → scale by replica count (EC2 ASG analogue).
- The **SQS queue decouples ingest from processing**, absorbing the 08:30 login/upload spike
  (`§2.2.4`); throughput scales by adding workers (demonstrated by `docker compose up --scale`).
- **S3** scales storage independently of compute (`§2.3.4`).
- Prod design uses target-tracking ASGs at 70% CPU (`§3.9.2`, `§5.1.8`) — documented, with the
  replica-scaling demonstration as the local analogue.

---

## 12. Availability & Reliability Approach (§10.3–§10.5, NFR-1/4)

- Multi-AZ design across `ap-southeast-2a/2b`; RDS Multi-AZ synchronous standby, <60s failover
  (`§5.3.4`). Prototype **simulates** failover (stop primary MySQL → documented recovery).
- Health checks isolate/replace unhealthy instances (`§5.1.6`); `/health` reports per-dependency.
- Retry + DLQ for processing failures (`§10.10`); versioned S3 guards against overwrite (`§5.4.6`).

---

## 13. Monitoring / Observability (§7, NFR-6)

- Structured JSON logs with `requestId`, tier, route, status, latency.
- Web Tier emits an **ALB-style access-log line per request** to CloudWatch Logs.
- Custom metrics: `RequestCount`, `SuccessCount`, `FailureCount`, `ProcessingTimeMs`, `QueueDepth`.
- **HTTP-400 pipeline** (the report's headline monitoring requirement): metric filter on
  `status_code=400` → `HTTP400ErrorCount` → alarm `>50`/min → SNS `classquest-admin-alerts`
  (`§7.6–§7.8`). Fully reproducible on LocalStack via the demo "400 burst" control.
- `/dashboard/metrics` aggregates real values (no decorative numbers — brief §20).

---

## 14. Failure Scenarios

| Scenario | Behaviour | Mechanism |
|----------|-----------|-----------|
| Worker crashes mid-job | Message visibility timeout expires → redelivered | SQS visibility timeout |
| Repeated processing failure | After 3 attempts → DLQ, asset `failed`, UI shows error | SQS redrive policy §10.10 |
| App Tier dependency down (S3/SQS/MySQL) | `503`, tier marked degraded | `/health` + error middleware |
| HTTP 400 spike (bad clients) | Alarm fires, SNS alert | CloudWatch metric filter + alarm §7.7 |
| AZ / DB primary failure | Failover to standby (simulated) | RDS Multi-AZ §5.3.4 (documented) |
| Invalid upload (type/size) | `400` with sanitized message, no S3 write | zod validation §13 |

---

## 15. Prototype Limitations (brief §4, §20; report §12.9)

1. RDS is a MySQL 8 container, not a managed Multi-AZ RDS instance; failover is simulated.
   The CloudWatch **metric filter and metric data are real** (the `>50 HTTP 400/min`
   breach is measured and recorded on LocalStack), but LocalStack **Community** does not
   run the alarm *evaluation* engine that transitions an alarm's `StateValue` to `ALARM`
   from metric data (that requires LocalStack Pro or real AWS). The alarm resource, metric
   filter, threshold and SNS wiring are all provisioned correctly; only the automatic
   state transition is unavailable locally.
2. Route 53 / NLB / ALB / Auto Scaling / VPC subnets / WAF / Shield are modelled in Terraform and
   behaviour, not provisioned as live AWS control-plane resources.
3. SNS email delivery is captured by LocalStack, not sent to a real inbox.
4. S3 Glacier retrieval latency (`§10.11`) is not emulated; tier transition is reported, not timed.
5. All learning content is synthetic sample data (labelled `DEMO/SAMPLE`); no real student data.
6. No real TLS/billing/DNS. See `RESEARCH_TRACEABILITY.md` for per-requirement status.
