/**
 * Job processing logic (report 3.7, 10.10). Separated from the polling loop so
 * it can be unit/integration tested. Returns an outcome telling the caller
 * whether to delete the SQS message (success/terminal) or leave it for
 * redelivery (retry), so the queue's redrive policy sends poison messages to
 * the DLQ after maxReceiveCount attempts.
 */
import {
  assetRepo,
  jobRepo,
  StorageService,
  MetricsService,
  loadConfig,
  nextStateAfterAttempt,
  createLogger,
  type ProcessingMessage,
} from '@classquest/shared';

const log = createLogger('worker');

export interface ProcessOutcome {
  /** Delete the SQS message? true on success OR on terminal failure. */
  deleteMessage: boolean;
  finalState: 'completed' | 'failed' | 'queued';
  jobId: string;
}

/**
 * Process one message. `approxReceiveCount` is the SQS delivery attempt number
 * (1-based) and determines whether a failure is a retry or terminal.
 */
export async function processMessage(
  msg: ProcessingMessage,
  approxReceiveCount: number,
  deps?: { storage?: StorageService; metrics?: MetricsService },
): Promise<ProcessOutcome> {
  const cfg = loadConfig();
  const storage = deps?.storage ?? new StorageService();
  const metrics = deps?.metrics ?? new MetricsService();

  const job = await jobRepo.findById(msg.jobId);
  if (!job) {
    // Nothing to process — drop the message so it does not loop forever.
    log.warn({ jobId: msg.jobId }, 'job not found; dropping message');
    return { deleteMessage: true, finalState: 'failed', jobId: msg.jobId };
  }

  const started = Date.now();
  await jobRepo.setState(msg.jobId, 'processing', { incrementAttempts: true, markStarted: true });
  await assetRepo.setStatus(msg.assetId, 'processing');

  try {
    // "Processing": read the object from S3 to confirm it is retrievable, then
    // derive lightweight metadata. A real pipeline would transcode/extract.
    const body = await storage.getObjectBuffer(msg.s3Key);
    if (msg.induceFailure) {
      throw new Error('Induced failure (demo): simulated processing error');
    }
    if (body.length === 0) {
      throw new Error('Processed object is empty');
    }

    const elapsed = Date.now() - started;
    await jobRepo.setState(msg.jobId, 'completed', { markFinished: true, error: null });
    await assetRepo.setStatus(msg.assetId, 'completed');
    await metrics.incrementCounter('SuccessCount');
    await metrics.recordLatency('ProcessingTimeMs', elapsed);
    log.info({ jobId: msg.jobId, assetId: msg.assetId, elapsed }, 'job completed');
    return { deleteMessage: true, finalState: 'completed', jobId: msg.jobId };
  } catch (err) {
    const message = (err as Error).message;
    const next = nextStateAfterAttempt(false, approxReceiveCount, cfg.worker.maxAttempts);
    await metrics.incrementCounter('FailureCount');

    if (next === 'failed') {
      await jobRepo.setState(msg.jobId, 'failed', { markFinished: true, error: message });
      await assetRepo.setStatus(msg.assetId, 'failed');
      log.error({ jobId: msg.jobId, attempts: approxReceiveCount, err: message }, 'job failed (terminal -> DLQ)');
      // Delete so the main queue stops redelivering; the DLQ already captured
      // it via the redrive policy on prior deliveries.
      return { deleteMessage: true, finalState: 'failed', jobId: msg.jobId };
    }

    // Retry: record the error, set back to queued, and DO NOT delete the
    // message so SQS redelivers it after the visibility timeout.
    await jobRepo.setState(msg.jobId, 'queued', { error: message });
    await assetRepo.setStatus(msg.assetId, 'queued');
    log.warn({ jobId: msg.jobId, attempt: approxReceiveCount, err: message }, 'job failed; will retry');
    return { deleteMessage: false, finalState: 'queued', jobId: msg.jobId };
  }
}
