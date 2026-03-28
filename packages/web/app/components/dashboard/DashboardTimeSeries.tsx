'use client';

import { useMemo } from 'react';

import { Activity, CheckCircle, Cpu } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { TenantSummaryRow, TimeSeriesPoint } from '@/app/lib/dashboard';

import { MiniAreaChart } from './MiniAreaChart';
import {
  MINI_CHARTS,
  computeAggregates,
  formatCompact,
  formatExecutionQuota,
  formatSuccessRate,
} from './timeSeriesHelpers';
import { useCountUp } from './useCountUp';

/* ─── Animated stat card ─── */

interface StatProps {
  icon: typeof Activity;
  label: string;
  value: number;
  format: (n: number) => string;
  index: number;
}

function Stat({ icon: Icon, label, value, format, index }: StatProps) {
  const animated = useCountUp(value);
  const delay = `${index * 80}ms`;

  return (
    <div
      className="group flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2 animate-in fade-in slide-in-from-bottom-1 fill-mode-both"
      style={{ animationDelay: delay, animationDuration: '400ms' }}
    >
      <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 transition-colors duration-200 group-hover:bg-primary/20">
        <Icon className="size-3.5 text-primary transition-transform duration-200 group-hover:scale-110" />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{format(animated)}</span>
      </div>
    </div>
  );
}

/* ─── Skeleton ─── */

const SKELETON_HEIGHTS = [35, 42, 55, 38, 60, 48, 70, 52, 65, 45, 58, 40, 50, 62];

function StatSkeleton({ index }: { index: number }) {
  const delay = `${index * 80}ms`;
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 animate-in fade-in fill-mode-both"
      style={{ animationDelay: delay, animationDuration: '400ms' }}
    >
      <div className="size-7 rounded-md bg-muted animate-pulse" />
      <div className="flex flex-col gap-1.5">
        <div className="h-2.5 w-14 rounded bg-muted animate-pulse" />
        <div className="h-4 w-10 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}

function ChartSkeleton({ index }: { index: number }) {
  const delay = `${(index + 3) * 80}ms`;
  return (
    <div
      className="rounded-lg border bg-card p-3 animate-in fade-in fill-mode-both"
      style={{ animationDelay: delay, animationDuration: '400ms' }}
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="h-2.5 w-16 rounded bg-muted animate-pulse" />
        <div className="h-5 w-20 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="mt-3 flex items-end gap-[2px] h-[120px] pb-4 pl-8">
        {SKELETON_HEIGHTS.map((height, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-muted/60 animate-pulse"
            style={{ height: `${String(height)}%`, animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Stat cards row ─── */

function StaticStat({ icon: Icon, label, value, index }: {
  icon: typeof Activity;
  label: string;
  value: string;
  index: number;
}) {
  const delay = `${index * 80}ms`;
  return (
    <div
      className="group flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2 animate-in fade-in slide-in-from-bottom-1 fill-mode-both"
      style={{ animationDelay: delay, animationDuration: '400ms' }}
    >
      <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 transition-colors duration-200 group-hover:bg-primary/20">
        <Icon className="size-3.5 text-primary transition-transform duration-200 group-hover:scale-110" />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{value}</span>
      </div>
    </div>
  );
}

function StatCards({ rows }: { rows: TenantSummaryRow[] }) {
  const agg = useMemo(() => computeAggregates(rows), [rows]);
  const t = useTranslations('dashboard.charts');

  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat icon={Activity} label={t('totalExecutions')} value={agg.executions} format={formatExecutionQuota} index={0} />
      <Stat icon={Cpu} label={t('totalTokens')} value={agg.tokens} format={formatCompact} index={1} />
      <StaticStat
        icon={CheckCircle}
        label={t('successRate')}
        value={formatSuccessRate(agg.executions, agg.failed)}
        index={2}
      />
    </div>
  );
}

/* ─── Loading state ─── */

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => <StatSkeleton key={i} index={i} />)}
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => <ChartSkeleton key={i} index={i} />)}
      </div>
    </div>
  );
}

/* ─── Time-series charts ─── */

function TimeSeriesCharts({ data }: { data: TimeSeriesPoint[] }) {
  const t = useTranslations('dashboard.charts');

  return (
    <div className="flex flex-col gap-3">
      {MINI_CHARTS.map((def, i) => (
        <MiniAreaChart key={def.dataKey} data={data} def={def} label={t(def.labelKey)} index={i} />
      ))}
    </div>
  );
}

/* ─── Public component ─── */

interface DashboardTimeSeriesProps {
  tenantRows: TenantSummaryRow[];
  timeSeriesData: TimeSeriesPoint[];
  loading?: boolean;
}

export function DashboardTimeSeries({ tenantRows, timeSeriesData, loading }: DashboardTimeSeriesProps) {
  if (loading === true) return <LoadingSkeleton />;

  return (
    <div className="flex flex-col gap-3 bg-sidebar p-3 rounded-md h-full overflow-y-auto border">
      <StatCards rows={tenantRows} />
      <TimeSeriesCharts data={timeSeriesData} />
    </div>
  );
}
