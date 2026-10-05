/**
 * AlertService — Amazon SNS admin alerting (report 7.8).
 * Publishes to the classquest-admin-alerts topic. In prod this fans out to an
 * email subscription; under LocalStack the publish is captured locally.
 */
import {
  CreateTopicCommand,
  PublishCommand,
  ListTopicsCommand,
} from '@aws-sdk/client-sns';
import { snsClient } from './clients.js';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('alerts');

export class AlertService {
  private readonly topicName: string;
  private topicArnCache: string | undefined;

  constructor(topicName?: string) {
    this.topicName = topicName ?? loadConfig().snsTopicName;
  }

  /** Resolve the topic ARN (creating idempotently if needed). */
  async topicArn(): Promise<string> {
    if (this.topicArnCache) return this.topicArnCache;
    const out = await snsClient().send(new CreateTopicCommand({ Name: this.topicName }));
    if (!out.TopicArn) throw new Error('Could not resolve SNS topic ARN');
    this.topicArnCache = out.TopicArn;
    return out.TopicArn;
  }

  async publishAlert(subject: string, message: Record<string, unknown>): Promise<string> {
    const arn = await this.topicArn();
    const out = await snsClient().send(
      new PublishCommand({
        TopicArn: arn,
        Subject: subject.slice(0, 100),
        Message: JSON.stringify(message, null, 2),
      }),
    );
    log.info({ subject, messageId: out.MessageId }, 'publishAlert');
    return out.MessageId ?? '';
  }

  async healthy(): Promise<boolean> {
    try {
      await snsClient().send(new ListTopicsCommand({}));
      return true;
    } catch {
      return false;
    }
  }
}
