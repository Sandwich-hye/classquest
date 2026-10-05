/** Shared cloud-service singletons for the App Tier. */
import {
  StorageService,
  QueueService,
  MetricsService,
  AlertService,
  loadConfig,
} from '@classquest/shared';

export const config = loadConfig();
export const storage = new StorageService();
export const queue = new QueueService();
export const metrics = new MetricsService();
export const alerts = new AlertService();

export const HTTP_400_ALARM_NAME = 'ClassQuest-HTTP400-HighErrorRate';
