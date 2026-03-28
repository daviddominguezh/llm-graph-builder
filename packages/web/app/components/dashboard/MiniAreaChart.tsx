'use client';

import { useMemo, useState } from 'react';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import type { TimeSeriesPoint } from '@/app/lib/dashboard';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

import type { MiniChartDef, TimeRange } from './timeSeriesHelpers';
import {
  bucketData,
  buildChartConfig,
  formatCompact,
  formatTickForRange,
  formatTooltipLabel,
  maxForRange,
  sumForRange,
} from './timeSeriesHelpers';

/* ─── Gradient ─── */

function AreaGradient({ id, colorVar }: { id: string; colorVar: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={colorVar} stopOpacity={0.3} />
      <stop offset="100%" stopColor={colorVar} stopOpacity={0.02} />
    </linearGradient>
  );
}

/* ─── Range selector ─── */

const RANGES: TimeRange[] = ['1d', '7d', '30d'];
const activeTab = 'bg-popover dark:bg-input text-foreground shadow-sm';
const inactiveTab = 'text-muted-foreground hover:text-foreground border-transparent hover:bg-input dark:hover:bg-card';
const tabBase =
  'cursor-pointer inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors border border-transparent';

function RangeSelector({ value, onChange }: { value: TimeRange; onChange: (r: TimeRange) => void }) {
  return (
    <div className="inline-flex gap-1 dark:gap-0.5 rounded-sm border bg-muted/50 p-0.5">
      {RANGES.map((r) => (
        <button key={r} type="button" onClick={() => onChange(r)} className={`${tabBase} ${r === value ? activeTab : inactiveTab}`}>
          {r}
        </button>
      ))}
    </div>
  );
}

/* ─── Header ─── */

function ChartHeader({ label, value, range, onRange }: {
  label: string;
  value: string;
  range: TimeRange;
  onRange: (r: TimeRange) => void;
}) {
  return (
    <div className="mb-1 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-[10px] font-semibold tabular-nums">{value}</span>
      </div>
      <RangeSelector value={range} onChange={onRange} />
    </div>
  );
}

/* ─── Tick gap per range ─── */

const TICK_GAPS: Record<TimeRange, number> = { '1d': 50, '7d': 60, '30d': 40 };

/* ─── Public component ─── */

interface MiniAreaChartProps {
  data: TimeSeriesPoint[];
  def: MiniChartDef;
  label: string;
  index: number;
}

export function MiniAreaChart({ data, def, label, index }: MiniAreaChartProps) {
  const config = buildChartConfig(def, label);
  const [range, setRange] = useState<TimeRange>('7d');
  const bucketed = useMemo(() => bucketData(data, range), [data, range]);
  const rangeTotal = def.aggregate === 'sum' ? sumForRange(bucketed, def.dataKey) : maxForRange(bucketed, def.dataKey);
  const tickFormatter = useMemo(() => formatTickForRange(range), [range]);
  const delay = `${240 + index * 80}ms`;

  return (
    <div
      className="rounded-lg border bg-background p-3 animate-in fade-in slide-in-from-bottom-1 fill-mode-both"
      style={{ animationDelay: delay, animationDuration: '400ms' }}
    >
      <ChartHeader label={label} value={def.formatValue(rangeTotal)} range={range} onRange={setRange} />
      <ChartContainer config={config} className="h-[130px] w-full">
        <AreaChart data={bucketed} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <defs>
            <AreaGradient id={def.gradientId} colorVar={`var(--color-${def.configKey})`} />
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFormatter}
            tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
            interval="preserveStartEnd"
            minTickGap={TICK_GAPS[range]}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
            width={40}
            allowDecimals={false}
            tickFormatter={(v: number) => formatCompact(v)}
          />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={formatTooltipLabel} />} />
          <Area
            type="monotone"
            dataKey={def.dataKey}
            fill={`url(#${def.gradientId})`}
            stroke={`var(--color-${def.configKey})`}
            strokeWidth={1.5}
            dot={false}
            animationDuration={800}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
