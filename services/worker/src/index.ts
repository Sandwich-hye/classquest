/**
 * Worker entry point (report 3.7). Long-polls SQS and processes asset jobs.
 * Scales horizontally by replica count (elasticity, report 10.1) — run
 * `docker compose up -d --scale worker=3` to demonstrate.
 */
import {
  QueueService,
  MetricsService,
  waitAndMigrate,
  loadConfig,
  createLogger,
  type ProcessingMessage,
} from '@classquest/shared';
import { processMessage } from './processor.js';

const log = createLogger('worker');
let running = true;

async function pollOnce(queue: QueueService, metrics: MetricsService): Promise<void> {
  const messages = await queue.receive(5);
  if (messages.length === 0) return;

  // Report queue depth as a metric for the dashboard (report 7).
  void queue.depth().then((d) => metrics.putMetric('QueueDepth', d)).catch(() => undefined);

  for (const m of messages) {
    if (!m.Body || !m.ReceiptHandle) continue;
    let payload: ProcessingMessage;
    try {
      payload = JSON.parse(m.Body) as ProcessingMessage;
    } catch (err) {
      log.error({ err: (err as Error).message }, 'malformed message; deleting');
      await queue.deleteMessage(m.ReceiptHandle);
      continue;
    }

    const receiveCount = Number(m.Attributes?.ApproximateReceiveCount ?? '1');
    try {
      const outcome = await processMessage(payload, receiveCount);
      if (outcome.deleteMessage) {
        await queue.deleteMessage(m.ReceiptHandle);
      }
      // If not deleting, the message becomes visible again after the
      // visibility timeout and SQS redelivers it (retry / eventual DLQ).
    } catch (err) {
      // Unexpected error: leave the message for redelivery.
      log.error({ jobId: payload.jobId, err: (err as Error).message }, 'processing threw; will retry');
    }
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  log.info({ cloudTarget: cfg.cloudTarget, maxAttempts: cfg.worker.maxAttempts }, 'Worker starting');

  // Share the schema/connection with the app tier.
  await waitAndMigrate();

  const queue = new QueueService();
  const metrics = new MetricsService();

  // Wait until the queue exists (Terraform may still be applying).
  for (let i = 0; i < 30 && running; i++) {
    if (await queue.healthy()) break;
    log.info('waiting for SQS queue to exist...');
    await new Promise((r) => setTimeout(r, 2000));
  }

  log.info('Worker polling for jobs');
  while (running) {
    try {
      await pollOnce(queue, metrics);
    } catch (err) {
      log.error({ err: (err as Error).message }, 'poll loop error; backing off');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  log.info('Worker stopped');
}

function shutdown(signal: string): void {
  log.info({ signal }, 'shutdown requested');
  running = false;
  // Allow the current long-poll to finish, then exit.
  setTimeout(() => process.exit(0), (loadConfig().worker.pollWaitSeconds + 2) * 1000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  log.error({ err: err.message, stack: err.stack }, 'Worker failed to start');
  process.exit(1);
});
