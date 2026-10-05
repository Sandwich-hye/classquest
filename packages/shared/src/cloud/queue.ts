/**
 * QueueService — Amazon SQS async pipeline (report 3.7, 10.10).
 * Decouples ingest from processing so traffic spikes are absorbed (report
 * 2.2.4). DLQ handling is configured in Terraform (redrive maxReceiveCount=3).
 */
import {
  GetQueueUrlCommand,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  type Message,
} from '@aws-sdk/client-sqs';
import { sqsClient } from './clients.js';
import { loadConfig } from '../config.js';
import type { ProcessingMessage } from '../domain/types.js';
import { createLogger } from '../logger.js';

const log = createLogger('queue');

export class QueueService {
  private readonly queueName: string;
  private queueUrlCache: string | undefined;

  constructor(queueName?: string) {
    this.queueName = queueName ?? loadConfig().sqsQueueName;
  }

  private async queueUrl(): Promise<string> {
    if (this.queueUrlCache) return this.queueUrlCache;
    const out = await sqsClient().send(new GetQueueUrlCommand({ QueueName: this.queueName }));
    if (!out.QueueUrl) throw new Error(`Queue not found: ${this.queueName}`);
    this.queueUrlCache = out.QueueUrl;
    return out.QueueUrl;
  }

  async enqueue(message: ProcessingMessage): Promise<string> {
    const url = await this.queueUrl();
    const out = await sqsClient().send(
      new SendMessageCommand({ QueueUrl: url, MessageBody: JSON.stringify(message) }),
    );
    log.info({ jobId: message.jobId, messageId: out.MessageId }, 'enqueue');
    return out.MessageId ?? '';
  }

  /** Long-poll for messages (report: efficiency / wait time). */
  async receive(maxMessages = 1, waitSeconds?: number): Promise<Message[]> {
    const cfg = loadConfig();
    const url = await this.queueUrl();
    const out = await sqsClient().send(
      new ReceiveMessageCommand({
        QueueUrl: url,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitSeconds ?? cfg.worker.pollWaitSeconds,
        VisibilityTimeout: cfg.worker.visibilityTimeout,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
      }),
    );
    return out.Messages ?? [];
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    const url = await this.queueUrl();
    await sqsClient().send(new DeleteMessageCommand({ QueueUrl: url, ReceiptHandle: receiptHandle }));
  }

  /** Approximate number of messages waiting — drives the QueueDepth metric. */
  async depth(): Promise<number> {
    const url = await this.queueUrl();
    const out = await sqsClient().send(
      new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['ApproximateNumberOfMessages'] }),
    );
    return Number(out.Attributes?.ApproximateNumberOfMessages ?? 0);
  }

  async healthy(): Promise<boolean> {
    try {
      await this.queueUrl();
      return true;
    } catch {
      return false;
    }
  }
}
