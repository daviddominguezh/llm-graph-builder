import { consoleLogger } from '../logger.js';

export type MetricTags = Readonly<Record<string, string | number | boolean>>;

const METRIC_PREFIX = 'metric';

const EMPTY_LENGTH = 0;

function formatTags(tags: MetricTags | undefined): string {
  if (tags === undefined) return '';
  const entries = Object.entries(tags);
  if (entries.length === EMPTY_LENGTH) return '';
  const parts = entries.map(([k, v]) => `${k}=${String(v)}`);
  return ` ${parts.join(' ')}`;
}

export function recordMetric(name: string, tags?: MetricTags): void {
  consoleLogger.info(`${METRIC_PREFIX}:${name}${formatTags(tags)}`);
}
