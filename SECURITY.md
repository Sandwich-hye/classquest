# Security Notes — ClassQuest Cloud Prototype

Security-by-design controls implemented in the prototype, mapped to the INFS803
report (§6, §2.3.6, §12.4). This is a research prototype; items marked
_documented_ describe the intended production control rather than a live one.

## Authentication & authorisation
- **Human auth**: JWT (short expiry, `JWT_EXPIRES_IN`) with bcrypt-hashed
  passwords. Issued on `/auth/login`; verified by `requireAuth`.
- **RBAC**: `requireRole('teacher','admin')` guards uploads and the dashboard
  (least privilege, §2.3.6). Students cannot publish or view ops metrics.
- **Service auth (credential-less)**: services obtain credentials via the AWS
  SDK default chain / `AssumeRole` (`auth/iam.ts`) — **no static keys in code**
  (§6.10). Under LocalStack the dummy `test` credentials are not real secrets.

## Least-privilege IAM (Terraform, `infra/terraform/iam.tf`)
- `classquest-web-role`: `s3:GetObject`, `s3:ListBucket`, log writes (read-only).
- `classquest-app-role`: adds `s3:PutObject`, scoped `sqs:*`,
  `cloudwatch:PutMetricData` (namespace-scoped). Mirrors the report's
  web-read / app-write split (§2.3.6).

## Input validation & upload safety
- Every request body/field validated with zod (`domain/schemas.ts`).
- File **type allow-list** per asset type + **size limit** (`MAX_UPLOAD_BYTES`).
- Parameterised SQL only (`db/repositories.ts`) — no string interpolation.

## Edge & transport
- Web Tier **rate limiting** (`express-rate-limit`) as a WAF/Shield stand-in
  (§6.11). Production WAF/Shield is _documented_ in `ARCHITECTURE.md`.
- **helmet** security headers on both HTTP services (CSP, HSTS, etc.).
- TLS 1.3 at the edge and SSE-KMS at rest are _documented_ for production
  (§6.8, §6.12); the local demo runs over HTTP.

## Data protection
- S3 **Block Public Access** enabled; objects retrieved via **presigned URLs**
  only (§5.4.7). Bucket versioning + SSE configured in Terraform.
- DB reachable only from app/worker via the private Compose network
  (Security-Group / NACL stand-in, §6.4–§6.5).

## Secrets handling
- All secrets come from environment variables (`.env`, gitignored). The repo
  ships only `.env.example` with clearly-labelled dummy values.
- Logs **redact** secrets (`logger.ts`): passwords, JWT secret, AWS secret key,
  `authorization` headers.
- Production secret source is **AWS Secrets Manager / SSM** (_documented_, §6.10).

## Error handling
- Central error middleware returns `{code,message,requestId}`; internal detail
  and stack traces go to logs only (never to the client).
- Dependency failures surface as `503` with a degraded `/health` report.

## Known prototype security limitations
- No real TLS certificates (HTTP locally).
- Demo-mode endpoints (`/demo/*`) are intentionally unauthenticated for ease of
  demonstration; in production they would be admin-gated or removed.
- Multi-AZ, WAF, Shield, GuardDuty, CloudTrail from the report are documented,
  not provisioned locally.

## Reporting
This is an academic prototype with no production data. For the real system,
report security issues to the ClassQuest security contact (not included here).
