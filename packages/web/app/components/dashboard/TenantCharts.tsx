'use client';

import { useMemo } from 'react';

import { Activity, Coins, Cpu } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { TenantSummaryRow } from '@/app/lib/dashboard';

import { useCountUp } from './useCountUp';

/* ─── Data helpers ─── */

interface TenantChartsProps {
  rows: TenantSummaryRow[];
}

function useAggregates(rows: TenantSummaryRow[]) {
  return useMemo(() => {
    let executions = 0;
    let cost = 0;
    let tokens = 0;
    for (const r of rows) {
      executions += r.total_executions;
      cost += r.total_cost;
      tokens += r.total_input_tokens + r.total_output_tokens;
    }
    return { executions, cost, tokens };
  }, [rows]);
}

function useSortedRows(rows: TenantSummaryRow[]): TenantSummaryRow[] {
  return useMemo(
    () => [...rows].sort((a, b) => b.total_executions - a.total_executions),
    [rows]
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCostValue(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/* ─── Animated stat cards ─── */

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
      className="group flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 animate-in fade-in slide-in-from-bottom-1 fill-mode-both"
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

/* ─── Inline proportion bar ─── */

const BAR_COLORS = [
  'bg-[oklch(0.59_0.20_277)]',
  'bg-[oklch(0.68_0.16_277)]',
  'bg-[oklch(0.79_0.10_275)]',
  'bg-[oklch(0.51_0.23_277)]',
  'bg-[oklch(0.46_0.21_277)]',
  'bg-[oklch(0.72_0.13_277)]',
];

function ProportionBar({ ratio, colorIndex }: { ratio: number; colorIndex: number }) {
  const pct = Math.max(ratio * 100, 2);
  const color = BAR_COLORS[colorIndex % BAR_COLORS.length] ?? BAR_COLORS[0];

  return (
    <div className="h-1.5 w-full rounded-full bg-muted/60">
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${color}`}
        style={{ width: `${String(pct)}%` }}
      />
    </div>
  );
}

/* ─── Metric cell ─── */

function MetricCell({ value, max, format, colorIndex }: {
  value: number;
  max: number;
  format: (n: number) => string;
  colorIndex: number;
}) {
  const ratio = max > 0 ? value / max : 0;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium tabular-nums">{format(value)}</span>
      <ProportionBar ratio={ratio} colorIndex={colorIndex} />
    </div>
  );
}

/* ─── Tenant breakdown ─── */

function TenantBreakdown({ rows }: { rows: TenantSummaryRow[] }) {
  const t = useTranslations('dashboard.charts');
  const sorted = useSortedRows(rows);

  const maxExec = useMemo(() => Math.max(...sorted.map((r) => r.total_executions), 1), [sorted]);
  const maxCost = useMemo(() => Math.max(...sorted.map((r) => r.total_cost), 0.0001), [sorted]);
  const maxTokens = useMemo(
    () => Math.max(...sorted.map((r) => r.total_input_tokens + r.total_output_tokens), 1),
    [sorted]
  );

  return (
    <div
      className="rounded-lg border bg-card animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
      style={{ animationDelay: '240ms', animationDuration: '400ms' }}
    >
      <div className="grid grid-cols-[1fr_80px_80px_80px] gap-x-3 border-b px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('tenant')}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('totalExecutions')}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('totalCost')}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('totalTokens')}
        </span>
      </div>
      {sorted.map((row, i) => (
        <div
          key={row.tenant_id}
          className="grid grid-cols-[1fr_80px_80px_80px] items-center gap-x-3 border-b last:border-b-0 px-3 py-2 animate-in fade-in fill-mode-both"
          style={{ animationDelay: `${280 + i * 60}ms`, animationDuration: '300ms' }}
        >
          <span className="truncate text-xs font-medium" title={row.tenant_id}>
            {row.tenant_id}
          </span>
          <MetricCell value={row.total_executions} max={maxExec} format={formatCompact} colorIndex={i} />
          <MetricCell value={row.total_cost} max={maxCost} format={formatCostValue} colorIndex={i} />
          <MetricCell
            value={row.total_input_tokens + row.total_output_tokens}
            max={maxTokens}
            format={formatCompact}
            colorIndex={i}
          />
        </div>
      ))}
    </div>
  );
}

/* ─── Public component ─── */

export function TenantCharts({ rows }: TenantChartsProps) {
  const agg = useAggregates(rows);
  const t = useTranslations('dashboard.charts');

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={Activity} label={t('totalExecutions')} value={agg.executions} format={formatCompact} index={0} />
        <Stat icon={Coins} label={t('totalCost')} value={agg.cost} format={formatCostValue} index={1} />
        <Stat icon={Cpu} label={t('totalTokens')} value={agg.tokens} format={formatCompact} index={2} />
      </div>
      <TenantBreakdown rows={rows} />
    </div>
  );
}
