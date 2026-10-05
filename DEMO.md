# Demonstration Guide

A scripted, repeatable walkthrough for a supervisor/evaluator. Takes ~10 minutes
and exercises every architectural claim in the report. All data produced is
labelled `DEMO/SAMPLE` and is not real research output (brief §18, §20).

## 0. Start the stack

```bash
cp .env.example .env
docker compose up -d --build
```

Wait until containers are healthy (first run pulls images + builds):

```bash
docker compose ps
```

Open **http://localhost:8080**.

## 1. Seed sample data (cloud provisioning already done by Terraform)

On the login screen click **Seed demo data**. This:
- creates demo users (student/teacher/admin),
- uploads sample learning assets to **Amazon S3** (`documents/ videos/` prefixes),
- enqueues processing jobs to **Amazon SQS**,
- the **Worker** processes them to `completed`.

Sign in as the teacher: `teacher@classquest.example` / `DemoTeacher123!`.

## 2. Primary workflow — publish an asset (report §3.7)

Go to **Teacher Portal**:
1. Enter a title, choose a type, pick any small file.
2. Click **Upload & publish**.
3. Watch the **Processing pipeline (live)** panel move the job
   `submitted → queued → processing → completed`.

What happened across the architecture:
- Web Tier authenticated the request and wrote an ALB-style access log.
- App Tier stored the binary in **S3**, inserted metadata in **MySQL**, and
  enqueued a job on **SQS** (credential-less, via its IAM role).
- The **Worker** consumed the job, processed it, and updated state + CloudWatch
  metrics.

Switch to **Library** (or sign in as the student) and click **Open resource** —
the file is retrieved via a time-limited **presigned S3 URL** (report §4.9.6).

## 3. Fault tolerance — induced failure → DLQ (report §10.10)

On the **Operations Dashboard**, click **Induce failure → DLQ**. A poison job is
enqueued; the worker retries up to the configured maximum, then the job becomes
`failed` and the message is dead-lettered. Watch the **Job states** panel show a
`failed` entry.

## 4. Storage tiering — Standard → Glacier (report §5.4.5)

Click **Simulate Glacier tiering**. Completed demo assets transition to the
`GLACIER` storage class on demand (the 90-day lifecycle rule compressed for the
demo). The **Storage tiers** panel updates to show objects in `GLACIER`.

## 5. The headline alert — >50 HTTP 400/min (report §2.2.8, §7.6–7.8)

Click **Trigger HTTP-400 burst** (or run `npm run demo:400-burst`). This fires
60 intentional HTTP 400s through the Web Tier. Within ~1 minute:
- the CloudWatch **metric filter** counts `status_code=400`,
- the **alarm** `ClassQuest-HTTP400-HighErrorRate` exceeds the threshold (50),
- it publishes to the **SNS** topic (email in prod; captured by LocalStack here),
- the dashboard's **HTTP 400 alarm** banner flips to `ALARM`.

## 6. Elasticity — scale workers (report §10.1)

```bash
docker compose up -d --scale worker=3
```

Seed again or publish several assets; three workers now share the queue,
demonstrating horizontal scaling without code changes.

## 7. System status / observability

The dashboard's **System status** card shows live per-dependency health
(MySQL, S3, SQS, CloudWatch, SNS). Stop a dependency to see it flip:

```bash
docker compose stop mysql   # app-tier /health reports degraded (503)
docker compose start mysql
```

## Verify from the CLI (optional)

Inspect the real cloud resources on LocalStack:

```bash
# S3 objects
docker compose exec localstack awslocal s3 ls s3://classquest-media-assets-dev --recursive
# SQS queues
docker compose exec localstack awslocal sqs list-queues
# CloudWatch alarm state
docker compose exec localstack awslocal cloudwatch describe-alarms --alarm-names ClassQuest-HTTP400-HighErrorRate
```

## Reset

```bash
docker compose down -v   # removes volumes; next up re-provisions cleanly
```
