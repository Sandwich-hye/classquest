# Observability — ClassQuest Cloud Prototype

Maps to report §7 (Monitoring, Alerting and Operational Management) and NFR-6.

## Logs
- **Structured JSON** application logs via pino (`packages/shared/src/logger.ts`),
  with secret redaction. Each log line carries `tier`, and request logs carry a
  `requestId` for tracing.
- **ALB-style access logs**: the Web Tier writes one JSON event per request to
  CloudWatch Logs group `/aws/alb/classquest-<env>` (`AccessLogService`). Each
  event: `{ client_ip, method, path, status_code, latency_ms, request_id, user_agent }`.

## Metrics (CloudWatch, namespace `ClassQuest/Prototype`)
| Metric | Emitted by | Meaning |
|--------|------------|---------|
| `RequestCount` | app-tier middleware | total API requests |
| `SuccessCount` | app-tier + worker | 2xx/3xx responses; successful jobs |
| `ClientOrServerErrorCount` | app-tier middleware | 4xx/5xx responses |
| `RequestLatencyMs` | app-tier middleware | per-request latency |
| `ProcessingTimeMs` | worker | job processing duration |
| `FailureCount` | worker | failed job attempts |
| `QueueDepth` | worker + dashboard | SQS backlog |
| `HTTP400ErrorCount` | **metric filter** on access logs | count of `status_code=400` |

## The HTTP-400 alert pipeline (report §2.2.8, §7.6–§7.8)
```
Web Tier access log (JSON, status_code)
        │  CloudWatch Logs: /aws/alb/classquest-dev
        ▼
Metric filter  { $.status_code = 400 }  ->  HTTP400ErrorCount
        ▼
Alarm ClassQuest-HTTP400-HighErrorRate  (Sum > 50 in 60s, 1 datapoint)
        ▼
SNS topic classquest-admin-alerts  ->  email (prod) / captured locally
```
Trigger it from the dashboard ("Trigger HTTP-400 burst") or
`npm run demo:400-burst`.

## Health / status
- App Tier `GET /health` probes every dependency (MySQL, S3, SQS, CloudWatch,
  SNS) and returns `200` healthy / `503` degraded.
- Web Tier `GET /healthz` reports edge liveness.
- The dashboard surfaces per-dependency status, live job states, storage tiers,
  queue depth, latency, and the current alarm state — all measured, none
  fabricated (brief §20).
