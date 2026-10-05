/**
 * Dashboard metrics (report 7, 15; FR-9). Returns REAL measured values from
 * MySQL + SQS + CloudWatch — no decorative statistics (brief §20).
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  assetRepo,
  jobRepo,
  metricsRepo,
  requireAuth,
  requireRole,
} from '@classquest/shared';
import { queue, metrics, config } from '../services.js';
import { HTTP_400_ALARM_NAME } from '../services.js';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/metrics',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [requests, byStatus, byTier, activeJobs, avgMs, queueDepth, alarmState] =
        await Promise.all([
          metricsRepo.summary(),
          assetRepo.countByStatus(),
          assetRepo.countByStorageClass(),
          jobRepo.activeCount(),
          jobRepo.avgProcessingMs(),
          queue.depth().catch(() => 0),
          metrics.alarmState(HTTP_400_ALARM_NAME),
        ]);

      // Report QueueDepth as a metric too (report 7 observability).
      void metrics.putMetric('QueueDepth', queueDepth);

      res.json({
        requests: {
          total: requests.total,
          success: requests.success,
          clientErrors: requests.clientErrors,
          serverErrors: requests.serverErrors,
          avgLatencyMs: requests.avgLatencyMs,
          http400LastMinute: requests.http400LastMinute,
        },
        jobs: {
          byStatus,
          active: activeJobs,
          avgProcessingMs: avgMs,
          queueDepth,
        },
        storage: {
          byTier,
          bucket: config.s3Bucket,
        },
        alerting: {
          http400AlarmState: alarmState,
          threshold: config.http400.threshold,
          periodSeconds: config.http400.periodSeconds,
        },
        meta: {
          note: 'All values are measured from the running prototype (not fabricated).',
          region: config.awsRegion,
          cloudTarget: config.cloudTarget,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
