# Local Acceptance Checklist (Windows)

A step-by-step run of the full ClassQuest prototype on Windows with Docker
Desktop. Commands are for **Windows PowerShell**, run from the repository root.
Each step lists what you should see. Tick the boxes as you go.

> Run the UI steps (3–10) **before** the automated tests (step 11): the tests
> seed data and open resources as the demo student, which changes what the demo
> screens show.

## 0. Prerequisites

- [ ] Docker Desktop is running (WSL 2 backend, ≥ 4 GB memory).
- [ ] Git and Node.js 20+ are installed: `node --version` shows `v20` or later.
- [ ] Ports 8080, 4000, 3306 and 4566 are free:

```powershell
Get-NetTCPConnection -LocalPort 8080,4000,3306,4566 -State Listen -ErrorAction SilentlyContinue
```

Expected: no output. (A local MySQL service on 3306 is the usual conflict — stop it first.)

## 1. Repository and branch

```powershell
git clone https://github.com/Sandwich-hye/classquest.git
cd classquest
git checkout claude/classquest-repo-review-dhj25z
git log --oneline -8
```

- [ ] The log shows the Phase 1–5 commits and the final review commit.

## 2. Environment

```powershell
Copy-Item .env.example .env
Select-String -Path .env -Pattern '^(CLOUD_TARGET|DEMO_MODE|S3_BUCKET)='
npm ci
```

- [ ] `CLOUD_TARGET=localstack`, `DEMO_MODE=true`, `S3_BUCKET=classquest-media-assets-dev`.
- [ ] `npm ci` completes without errors.

## 3. Start the stack

```powershell
docker compose up -d --build
docker compose ps
```

Re-run `docker compose ps` until **app-tier** and **web-tier** show `healthy`
(first build: several minutes).

```powershell
docker compose logs terraform | Select-String 'Apply complete'
docker compose exec localstack awslocal sqs list-queues
docker compose exec localstack awslocal s3 ls
```

- [ ] Terraform printed `Apply complete!`.
- [ ] Queues `classquest-asset-processing` and `classquest-asset-processing-dlq` exist.
- [ ] Bucket `classquest-media-assets-dev` exists.

If a service is not healthy: `docker compose logs app-tier` (or `terraform`,
`worker`, `web-tier`), then `docker compose up -d` again.

## 4. Verify the database migration

```powershell
docker compose exec mysql mysql -uclassquest_app -pchange-me-locally classquest -e "SHOW TABLES; SELECT email, role FROM users;"
curl.exe -s http://localhost:4000/health
```

- [ ] Tables: `assets`, `jobs`, `request_metrics`, `resource_access`, `users`.
- [ ] Three demo users: admin, teacher, student.
- [ ] Health returns `"status":"healthy"` (or `degraded-observability` if LocalStack's CloudWatch/SNS is slow to respond — core services must be `true`).

## 5. Sign in as Student (empty library)

Open **http://localhost:8080** → sign in as `student@classquest.example` / `DemoStudent123!`.

- [ ] Lands on **Home**; sidebar shows Home · Library · My Progress.
- [ ] *Continue where you left off* shows the empty state.
- [ ] Visit http://localhost:8080/operations, /dashboard and /publish — each redirects to **/home**.
- [ ] Sign out.

## 6. Sign in as Teacher and seed

Sign in as `teacher@classquest.example` / `DemoTeacher123!`.

- [ ] Lands on **Dashboard**; sidebar shows Dashboard · Library · Publish Resource · Operations, with the *Teacher Portal* subtitle.
- [ ] Visit http://localhost:8080/progress — redirects to **/dashboard**.
- [ ] **Operations → Seed demo catalogue**: result says 4 new resources queued.
- [ ] Within ~30 s, **Dashboard → Published resources** shows 4 and **Library** shows four completed resources.

(Alternative to the button: `npm run demo:seed`.)

## 7. Upload a resource and watch the pipeline

**Publish Resource** → **Document** → title `Acceptance test notes` → drop a small
`.txt` or `.pdf` file → **Upload & publish**. In a second PowerShell window:

```powershell
docker compose logs -f worker
```

- [ ] The stepper moves **Submitted → Queued → Processing → Completed**.
- [ ] The worker log shows `job completed` for the job id. Press Ctrl+C to stop following.
- [ ] Optional: upload an `.mp4` as **Document** — the server rejects it with *Content type video/mp4 is not allowed for document*.

## 8. Open a resource as Student and check My Progress

Sign out → sign in as the student → **Library** → **Open Resource** on any card.

- [ ] A new tab opens the file from `http://localhost:4566/classquest-media-assets-dev/...` (a presigned URL).
- [ ] **My Progress**: Resources opened 1, Library coverage > 0 %, Last opened *Just now*, the resource listed under *Recently opened*.
- [ ] **Home** shows the resource under *Continue where you left off*.
- [ ] Click **Open again**, then verify the database:

```powershell
docker compose exec mysql mysql -uclassquest_app -pchange-me-locally classquest -e "SELECT asset_id, open_count, first_opened_at, last_opened_at FROM resource_access;"
```

- [ ] One row per opened resource; `open_count` is 2 for the one opened twice.
- [ ] Students cannot see job details: `/jobs` endpoints return 403 (covered by the automated tests).

## 9. Induce a worker failure — retries and the DLQ

Sign in as the teacher → **Operations → Induce processing failure**.

- [ ] The stepper shows *Attempt N failed — retrying automatically*, then **Failed** with *Processing failed after 3 attempts* (about 20–40 s).
- [ ] Worker log (`docker compose logs worker`) shows `will retry` twice and `job failed (final attempt); message left for SQS redrive to the DLQ`.
- [ ] Within a few seconds the message is on the DLQ:

```powershell
docker compose exec localstack sh -c 'awslocal sqs get-queue-attributes --attribute-names ApproximateNumberOfMessages --queue-url $(awslocal sqs get-queue-url --queue-name classquest-asset-processing-dlq --query QueueUrl --output text)'
docker compose exec localstack sh -c 'awslocal sqs receive-message --visibility-timeout 0 --queue-url $(awslocal sqs get-queue-url --queue-name classquest-asset-processing-dlq --query QueueUrl --output text)'
```

- [ ] `ApproximateNumberOfMessages` ≥ 1, and the received message body contains the failed job's `jobId` and `"induceFailure":true`.

## 10. Glacier simulation and HTTP 400 burst

**Simulate Glacier tiering** (Operations):

- [ ] Result lists the resources moved; **Storage overview → Glacier (simulated)** increases.

```powershell
docker compose exec localstack awslocal s3api list-objects-v2 --bucket classquest-media-assets-dev --query "Contents[].[Key,StorageClass]" --output table
```

- [ ] Those objects show `GLACIER`. (Opening a Glacier-tier resource may now be refused by S3 — restore is not implemented, which matches real Glacier behaviour.)

**Generate HTTP 400 burst** (Operations), or `npm run demo:400-burst`:

- [ ] Result: *60 of 60 requests returned HTTP 400*.
- [ ] Monitoring card: **Threshold exceeded**, *HTTP 400s, last 60 s* ≥ 60, CloudWatch alarm state as reported (normally `OK` or `INSUFFICIENT DATA` on LocalStack) and the *LocalStack demonstration limitation* note.
- [ ] Access-log events and the alarm exist on LocalStack:

```powershell
docker compose exec localstack awslocal logs filter-log-events --log-group-name /aws/alb/classquest-dev --filter-pattern '{ $.status_code = 400 }' --max-items 3
docker compose exec localstack awslocal cloudwatch describe-alarms --alarm-names ClassQuest-HTTP400-HighErrorRate
```

- [ ] Optional — health degradation: `docker compose stop mysql` → Operations shows MySQL *unavailable*; `docker compose start mysql` → healthy again.
- [ ] Optional — elasticity: `docker compose up -d --scale worker=3`, seed or upload several resources, `docker compose ps` shows three workers.

## 11. Automated tests (stack still running)

```powershell
npm run typecheck
npm run lint
npm test
```

- [ ] Typecheck and lint report no errors.
- [ ] `npm test`: unit, API, integration and e2e suites all **run and pass**; there are no `[SKIPPED] ... Docker stack not reachable` notices. Only `tests/integration/progressDb.test.ts` (4 tests) is skipped, because it is opt-in. The e2e suite takes 2–3 minutes.

Optional — run the database test against a disposable database in the Compose MySQL:

```powershell
docker compose exec mysql mysql -uroot -pchange-me-root-locally -e "CREATE DATABASE IF NOT EXISTS cq_test; GRANT ALL ON cq_test.* TO 'classquest_app'@'%';"
$env:TEST_MYSQL_DATABASE = 'cq_test'; $env:TEST_MYSQL_USER = 'classquest_app'; $env:TEST_MYSQL_PASSWORD = 'change-me-locally'
npx vitest run tests/integration/progressDb.test.ts
Remove-Item Env:TEST_MYSQL_DATABASE, Env:TEST_MYSQL_USER, Env:TEST_MYSQL_PASSWORD
```

- [ ] 4 tests pass.

## 12. Screenshots for the demo / report

- [ ] Login page with the demo-account hint
- [ ] Student **Home** (with *Continue where you left off*) and **My Progress**
- [ ] **Library** as student (completed only) and as teacher (status + tier badges)
- [ ] **Publish Resource** with a completed stepper and a failed (induced) stepper
- [ ] **Teacher Dashboard**
- [ ] **Operations**: monitoring card after the burst (*Threshold exceeded* + LocalStack limitation), Service health, Queue & job processing, Storage overview, Demonstration Controls results
- [ ] PowerShell output: DLQ message count, `resource_access` rows, `s3api list-objects-v2` showing `GLACIER`
- [ ] `npm test` summary

## 13. Shut down / reset

```powershell
docker compose down          # stop, keep data
docker compose down -v       # stop and delete MySQL + LocalStack data
```

For a completely fresh start, also remove the local Terraform state (LocalStack
data does not persist, so the state would otherwise describe deleted resources):

```powershell
Remove-Item -Recurse -Force infra/terraform/.terraform, infra/terraform/terraform.tfstate* -ErrorAction SilentlyContinue
```
