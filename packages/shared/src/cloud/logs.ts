/**
 * AccessLogService — ALB-style access logs to CloudWatch Logs (report 7.6).
 *
 * The Web Tier writes one JSON event per request to the access-log group.
 * Each event includes `status_code`, which the Terraform metric filter
 * (`{ $.status_code = 400 }`) counts to drive the HTTP400ErrorCount metric
 * and the >50/min alarm (report 2.2.8, 7.6-7.7).
 */
import {
  CreateLogStreamCommand,
  PutLogEventsCommand,
  DescribeLogStreamsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { cloudWatchLogsClient } from './clients.js';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('access-logs');

export interface AccessLogEvent {
  client_ip: string;
  method: string;
  path: string;
  status_code: number;
  latency_ms: number;
  request_id: string;
  user_agent?: string;
}

export class AccessLogService {
  private readonly logGroup: string;
  private readonly streamName: string;
  private sequenceToken: string | undefined;
  private streamEnsured = false;

  constructor(logGroup?: string, streamName?: string) {
    this.logGroup = logGroup ?? loadConfig().cwLogGroup;
    this.streamName = streamName ?? `web-tier-${process.pid}-${Date.now()}`;
  }

  private async ensureStream(): Promise<void> {
    if (this.streamEnsured) return;
    try {
      await cloudWatchLogsClient().send(
        new CreateLogStreamCommand({ logGroupName: this.logGroup, logStreamName: this.streamName }),
      );
    } catch {
      // Stream may already exist; fetch its sequence token.
      const out = await cloudWatchLogsClient().send(
        new DescribeLogStreamsCommand({
          logGroupName: this.logGroup,
          logStreamNamePrefix: this.streamName,
        }),
      );
      this.sequenceToken = out.logStreams?.[0]?.uploadSequenceToken;
    }
    this.streamEnsured = true;
  }

  /** Emit one access-log event. Failures never break the request path. */
  async write(event: AccessLogEvent): Promise<void> {
    try {
      await this.ensureStream();
      const out = await cloudWatchLogsClient().send(
        new PutLogEventsCommand({
          logGroupName: this.logGroup,
          logStreamName: this.streamName,
          sequenceToken: this.sequenceToken,
          logEvents: [{ timestamp: Date.now(), message: JSON.stringify(event) }],
        }),
      );
      this.sequenceToken = out.nextSequenceToken;
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'access-log write failed');
      // Reset so the next call re-resolves the sequence token.
      this.streamEnsured = false;
    }
  }
}
