/**
 * Health / system-status route (report 5.1.6, 7; FR-12). Reports the health
 * of the tier and each cloud dependency. Returns 503 if a dependency is down
 * so the UI can mark the system degraded (brief §13 fault tolerance).
 */
import { Router, type Request, type Response } from 'express';
import { pingDatabase } from '@classquest/shared';
import { storage, queue, metrics, alerts, config } from '../services.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  const [mysql, s3, sqs, cloudwatch, sns] = await Promise.all([
    pingDatabase(),
    storage.healthy(),
    queue.healthy(),
    metrics.healthy(),
    alerts.healthy(),
  ]);

  const deps = { mysql, s3, sqs, cloudwatch, sns };

  // Core dependencies gate liveness: without MySQL/S3/SQS the primary workflow
  // cannot run. CloudWatch/SNS are observability dependencies — if they are
  // unavailable the service still serves traffic (metrics are best-effort), so
  // they are reported but do not fail the health check. This also tolerates
  // LocalStack Community's partial CloudWatch API responses.
  const coreHealthy = mysql && s3 && sqs;
  const fullyHealthy = coreHealthy && cloudwatch && sns;
  const status = fullyHealthy ? 'healthy' : coreHealthy ? 'degraded-observability' : 'degraded';

  res.status(coreHealthy ? 200 : 503).json({
    tier: 'app-tier',
    status,
    cloudTarget: config.cloudTarget,
    region: config.awsRegion,
    dependencies: deps,
    note:
      coreHealthy && !fullyHealthy
        ? 'Core tiers healthy; an observability dependency (CloudWatch/SNS) is degraded.'
        : undefined,
    timestamp: new Date().toISOString(),
  });
});
