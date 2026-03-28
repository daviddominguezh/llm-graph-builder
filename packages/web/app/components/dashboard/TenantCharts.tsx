'use client';

import { useMemo } from 'react';

import { Activity, Coins, Cpu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';

import type { TenantSummaryRow } from '@/app/lib/dashboard';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

import { useCountUp } from './useCountUp';

/* ─── Constants ─── */

const MAX_ITEMS = 8;

const PIE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

const EXEC_CONFIG: ChartConfig = {
  total_executions: { label: 'Executions', color: 'var(--chart-3)' },
};

const COST_CONFIG: ChartConfig = {
  value: { label: 'Cost', color: 'var(--chart-2)' },
};

const TOKEN_CONFIG: ChartConfig = {
  input: { label: 'Input tokens', color: 'var(--chart-1)' },
  output: { label: 'Output tokens', color: 'var(--chart-4)' },
};

/* ─── Data helpers ─── */

interface ChartDatum {
  name: string;
  tenant_id: string;
  total_executions: number;
  total_cost: number;
  input: number;
  output: number;
}

interface TenantChartsProps {
  rows: TenantSummaryRow[];
}

function truncateId(id: string): string {
  const MAX_LEN = 12;
  return id.length > MAX_LEN ? id.slice(0, MAX_LEN) + '\u2026' : id;
}

function useChartData(rows: TenantSummaryRow[]): ChartDatum[] {
  return useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.total_executions - a.total_executions);
    return sorted.slice(0, MAX_ITEMS).map((r) => ({
      name: truncateId(r.tenant_id),
      tenant_id: r.tenant_id,
      total_executions: r.total_executions,
      total_cost: r.total_cost,
      input: r.total_input_tokens,
      output: r.total_output_tokens,
    }));
  }, [rows]);
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

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatCostValue(n: number): string {
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

/* ─── Chart wrapper ─── */

function ChartCard({ label, children, index }: { label: string; children: React.ReactNode; index: number }) {
  const delay = `${(index + 3) * 80}ms`;

  return (
    <div
      className="rounded-lg border bg-card p-3 animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
      style={{ animationDelay: delay, animationDuration: '400ms' }}
    >
      <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/* ─── Individual charts ─── */

function ExecutionsChart({ data, label, index }: { data: ChartDatum[]; label: string; index: number }) {
  return (
    <ChartCard label={label} index={index}>
      <ChartContainer config={EXEC_CONFIG} className="h-[140px] w-full">
        <BarChart data={data} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-20}
            dy={4}
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={false}
            width={32}
            tickFormatter={formatCompact}
          />
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.3 }} content={<ChartTooltipContent />} />
          <Bar
            dataKey="total_executions"
            fill="var(--color-total_executions)"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
            animationDuration={800}
            animationEasing="ease-out"
          />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

function CostChart({ data, label, index }: { data: ChartDatum[]; label: string; index: number }) {
  const pieData = useMemo(
    () => data.filter((d) => d.total_cost > 0).map((d) => ({ name: d.tenant_id, value: d.total_cost })),
    [data]
  );

  if (pieData.length === 0) return null;

  return (
    <ChartCard label={label} index={index}>
      <ChartContainer config={COST_CONFIG} className="mx-auto h-[140px] w-full">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            innerRadius="45%"
            outerRadius="80%"
            paddingAngle={3}
            strokeWidth={0}
            animationDuration={900}
            animationEasing="ease-out"
          >
            {pieData.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
    </ChartCard>
  );
}

function TokenChart({ data, label, index }: { data: ChartDatum[]; label: string; index: number }) {
  const hasTokens = data.some((d) => d.input > 0 || d.output > 0);
  if (!hasTokens) return null;

  return (
    <ChartCard label={label} index={index}>
      <ChartContainer config={TOKEN_CONFIG} className="h-[140px] w-full">
        <BarChart data={data} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-20}
            dy={4}
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={false}
            width={32}
            tickFormatter={formatCompact}
          />
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.3 }} content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            dataKey="input"
            fill="var(--color-input)"
            stackId="t"
            radius={[0, 0, 0, 0]}
            maxBarSize={32}
            animationDuration={800}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="output"
            fill="var(--color-output)"
            stackId="t"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
            animationDuration={800}
            animationBegin={200}
            animationEasing="ease-out"
          />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* ─── Public component ─── */

export function TenantCharts({ rows }: TenantChartsProps) {
  const data = useChartData(rows);
  const agg = useAggregates(rows);
  const t = useTranslations('dashboard.charts');

  if (data.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={Activity} label={t('totalExecutions')} value={agg.executions} format={formatCompact} index={0} />
        <Stat icon={Coins} label={t('totalCost')} value={agg.cost} format={formatCostValue} index={1} />
        <Stat icon={Cpu} label={t('totalTokens')} value={agg.tokens} format={formatCompact} index={2} />
      </div>
      <ExecutionsChart data={data} label={t('executionsByTenant')} index={0} />
      <CostChart data={data} label={t('costDistribution')} index={1} />
      <TokenChart data={data} label={t('tokenUsage')} index={2} />
    </div>
  );
}
