/**
 * Express middleware: request IDs, metric recording, and a central error
 * handler that sanitises responses (report 6, brief §13).
 */
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { metricsRepo, MetricsService, createLogger } from '@classquest/shared';

const log = createLogger('app-tier');
const metrics = new MetricsService();

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    startTime?: number;
  }
}

/** Attach a request id + start time for tracing and latency. */
export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.startTime = Date.now();
  next();
}

/**
 * On response finish, record the request to the local metrics mirror and to
 * CloudWatch (report 7). Powers the dashboard's real counts/latency.
 */
export function recordMetrics(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    const latency = Date.now() - (req.startTime ?? Date.now());
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
    void metricsRepo
      .record({ route, method: req.method, statusCode: res.statusCode, latencyMs: latency })
      .catch((err) => log.warn({ err: err.message }, 'metric mirror failed'));
    void metrics.incrementCounter('RequestCount');
    void metrics.recordLatency('RequestLatencyMs', latency);
    if (res.statusCode >= 200 && res.statusCode < 400) void metrics.incrementCounter('SuccessCount');
    if (res.statusCode >= 400) void metrics.incrementCounter('ClientOrServerErrorCount');
  });
  next();
}

/** A domain error with an HTTP status + stable code. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 404 fallthrough. */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
}

/**
 * Central error handler. Never leaks internals to the client (report 6);
 * full detail is logged with the request id.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.requestId ?? 'unknown';
  if (err instanceof ApiError) {
    log.warn({ requestId, code: err.code, status: err.status, msg: err.message }, 'handled error');
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId } });
    return;
  }
  // Unknown error: log full detail, return a generic message.
  log.error({ requestId, err: (err as Error).message, stack: (err as Error).stack }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId },
  });
};
