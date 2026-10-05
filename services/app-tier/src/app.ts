/** App Tier Express application factory (business logic layer, report 3.4). */
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requireAuth } from '@classquest/shared';
import { requestContext, recordMetrics, notFound, errorHandler } from './middleware.js';
import { authRouter } from './routes/auth.js';
import { assetsRouter } from './routes/assets.js';
import { jobsRouter } from './routes/jobs.js';
import { dashboardRouter } from './routes/dashboard.js';
import { healthRouter } from './routes/health.js';
import { demoRouter } from './routes/demo.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet()); // security headers (report 6 security-by-design)
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestContext);
  app.use(recordMetrics);

  // Health is unauthenticated (used by container + load balancer checks).
  app.use('/health', healthRouter);

  // Auth: /login is public; /me requires a valid token.
  app.use('/auth/me', requireAuth);
  app.use('/auth', authRouter);

  // Core business logic.
  app.use('/assets', assetsRouter);
  app.use('/jobs', jobsRouter);
  app.use('/dashboard', dashboardRouter);

  // Demo mode (brief §18).
  app.use('/demo', demoRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
