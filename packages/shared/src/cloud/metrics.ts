/**
 * MetricsService — custom CloudWatch metrics (report 7). Powers the dashboard
 * with real measured values (brief §20: no decorative statistics).
 */
import {
  PutMetricDataCommand,
  GetMetricStatisticsCommand,
  DescribeAlarmsCommand,
} from '@aws-sdk/client-cloudwatch';
import { cloudWatchClient } from './clients.js';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('metrics');

export class MetricsService {
  private readonly namespace: string;

  constructor(namespace?: string) {
    this.namespace = namespace ?? loadConfig().cwNamespace;
  }

  async putMetric(name: string, value: number, unit = 'Count'): Promise<void> {
    try {
      await cloudWatchClient().send(
        new PutMetricDataCommand({
          Namespace: this.namespace,
          MetricData: [{ MetricName: name, Value: value, Unit: unit as never, Timestamp: new Date() }],
        }),
      );
    } catch (err) {
      // Metrics must never break the request path.
      log.warn({ name, err: (err as Error).message }, 'putMetric failed');
    }
  }

  incrementCounter(name: string): Promise<void> {
    return this.putMetric(name, 1, 'Count');
  }

  recordLatency(name: string, ms: number): Promise<void> {
    return this.putMetric(name, ms, 'Milliseconds');
  }

  /** Sum of a metric over the last `seconds` (used by the dashboard). */
  async sumLast(name: string, seconds = 300): Promise<number> {
    try {
      const out = await cloudWatchClient().send(
        new GetMetricStatisticsCommand({
          Namespace: this.namespace,
          MetricName: name,
          StartTime: new Date(Date.now() - seconds * 1000),
          EndTime: new Date(),
          Period: Math.max(60, seconds),
          Statistics: ['Sum'],
        }),
      );
      return (out.Datapoints ?? []).reduce((acc, d) => acc + (d.Sum ?? 0), 0);
    } catch {
      return 0;
    }
  }

  /** Current state of the HTTP-400 alarm (report 7.7) for the dashboard. */
  async alarmState(alarmName: string): Promise<'OK' | 'ALARM' | 'INSUFFICIENT_DATA' | 'UNKNOWN'> {
    try {
      const out = await cloudWatchClient().send(
        new DescribeAlarmsCommand({ AlarmNames: [alarmName] }),
      );
      const state = out.MetricAlarms?.[0]?.StateValue;
      return (state as 'OK' | 'ALARM' | 'INSUFFICIENT_DATA') ?? 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }

  async healthy(): Promise<boolean> {
    try {
      await cloudWatchClient().send(new DescribeAlarmsCommand({ MaxRecords: 1 }));
      return true;
    } catch {
      return false;
    }
  }
}
