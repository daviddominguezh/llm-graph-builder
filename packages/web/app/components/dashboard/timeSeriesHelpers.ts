import type { TenantSummaryRow, TimeSeriesPoint } from '@/app/lib/dashboard';
import type { ChartConfig } from '@/components/ui/chart';
import type { ReactNode } from 'react';

/* ─── Time ranges ─── */

export type TimeRange = '1d' | '7d' | '30d';

interface RangeConfig {
  intervalMs: number;
  daysBack: number;
  formatTick: (d: Date) => string;
}

const MS_30MIN = 30 * 60 * 1000;
const MS_6H = 6 * 60 * 60 * 1000;
const MS_1D = 24 * 60 * 60 * 1000;

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateShort(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()] ?? 'Jan'} ${String(d.getDate())}`;
}

export const RANGE_CONFIGS: Record<TimeRange, RangeConfig> = {
  '1d': { intervalMs: MS_30MIN, daysBack: 1, formatTick: formatTime },
  '7d': { intervalMs: MS_6H, daysBack: 7, formatTick: formatDateShort },
  '30d': { intervalMs: MS_1D, daysBack: 30, formatTick: formatDateShort },
};

/* ─── Bucketing ─── */

function floorToInterval(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

function generateSlots(startMs: number, endMs: number, intervalMs: number): number[] {
  const slots: number[] = [];
  let current = floorToInterval(startMs, intervalMs);
  while (current <= endMs) {
    slots.push(current);
    current += intervalMs;
  }
  return slots;
}

function aggregateIntoSlots(
  points: TimeSeriesPoint[],
  slots: number[],
  intervalMs: number
): TimeSeriesPoint[] {
  const buckets = new Map<number, TimeSeriesPoint>();
  for (const slot of slots) {
    buckets.set(slot, { date: new Date(slot).toISOString(), executions: 0, cost: 0, users: 0, tenants: 0 });
  }

  for (const p of points) {
    const ts = new Date(p.date).getTime();
    const key = floorToInterval(ts, intervalMs);
    const bucket = buckets.get(key);
    if (bucket !== undefined) {
      bucket.executions += p.executions;
      bucket.cost += p.cost;
      bucket.users = Math.max(bucket.users, p.users);
      bucket.tenants = Math.max(bucket.tenants, p.tenants);
    }
  }

  return slots.map(
    (s) => buckets.get(s) ?? { date: new Date(s).toISOString(), executions: 0, cost: 0, users: 0, tenants: 0 }
  );
}

export function bucketData(rawData: TimeSeriesPoint[], range: TimeRange): TimeSeriesPoint[] {
  const config = RANGE_CONFIGS[range];
  const now = Date.now();
  const startMs = now - config.daysBack * MS_1D;
  const slots = generateSlots(startMs, now, config.intervalMs);
  return aggregateIntoSlots(rawData, slots, config.intervalMs);
}

/* ─── X axis formatting ─── */

export function formatTickForRange(range: TimeRange): (dateStr: string) => string {
  const config = RANGE_CONFIGS[range];
  return (dateStr: string) => config.formatTick(new Date(dateStr));
}

export function formatTooltipLabel(label: ReactNode): ReactNode {
  if (typeof label !== 'string') return label;
  const d = new Date(label);
  return `${formatDateShort(d)} ${formatTime(d)}`;
}

/* ─── Value formatting ─── */

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function formatCostValue(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/* ─── Aggregation ─── */

export interface Aggregates {
  executions: number;
  failed: number;
  tokens: number;
}

export function computeAggregates(rows: TenantSummaryRow[]): Aggregates {
  let executions = 0;
  let failed = 0;
  let tokens = 0;
  for (const r of rows) {
    executions += r.total_executions;
    failed += r.failed_executions;
    tokens += r.total_input_tokens + r.total_output_tokens;
  }
  return { executions, failed, tokens };
}

export function formatSuccessRate(total: number, failed: number): string {
  if (total === 0) return '—';
  const rate = ((total - failed) / total) * 100;
  return `${rate.toFixed(1)}%`;
}

const EXECUTION_LIMIT = 1000;

export function formatExecutionQuota(n: number): string {
  return `${formatCompact(n)}/${formatCompact(EXECUTION_LIMIT)}`;
}

/* ─── Range total ─── */

export function sumForRange(data: TimeSeriesPoint[], key: keyof Omit<TimeSeriesPoint, 'date'>): number {
  let total = 0;
  for (const point of data) {
    total += point[key];
  }
  return total;
}

export function maxForRange(data: TimeSeriesPoint[], key: keyof Omit<TimeSeriesPoint, 'date'>): number {
  let max = 0;
  for (const point of data) {
    if (point[key] > max) max = point[key];
  }
  return max;
}

/* ─── Chart configs ─── */

export interface MiniChartDef {
  dataKey: keyof Omit<TimeSeriesPoint, 'date'>;
  labelKey: string;
  gradientId: string;
  configKey: string;
  color: string;
  formatValue: (n: number) => string;
  aggregate: 'sum' | 'max';
}

export const MINI_CHARTS: MiniChartDef[] = [
  {
    dataKey: 'executions',
    labelKey: 'executionsOverTime',
    gradientId: 'fillExec',
    configKey: 'executions',
    color: 'var(--chart-3)',
    formatValue: formatCompact,
    aggregate: 'sum',
  },
  {
    dataKey: 'cost',
    labelKey: 'costOverTime',
    gradientId: 'fillCost',
    configKey: 'cost',
    color: 'var(--chart-1)',
    formatValue: formatCostValue,
    aggregate: 'sum',
  },
  {
    dataKey: 'users',
    labelKey: 'usersOverTime',
    gradientId: 'fillUsers',
    configKey: 'users',
    color: 'var(--chart-2)',
    formatValue: formatCompact,
    aggregate: 'max',
  },
  {
    dataKey: 'tenants',
    labelKey: 'tenantsOverTime',
    gradientId: 'fillTenants',
    configKey: 'tenants',
    color: 'var(--chart-4)',
    formatValue: formatCompact,
    aggregate: 'max',
  },
];

export function buildChartConfig(def: MiniChartDef, label: string): ChartConfig {
  return { [def.configKey]: { label, color: def.color } };
}
