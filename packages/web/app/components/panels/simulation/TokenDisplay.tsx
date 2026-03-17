'use client';

import { ArrowDownToLine, ArrowUpFromLine, Clock, Database, DollarSign } from 'lucide-react';

import type { SimulationTokens } from '../../../types/simulation';

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

interface TokenDisplayProps {
  tokens: SimulationTokens;
  durationMs?: number;
  className?: string;
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${String(ms)}ms`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function Separator() {
  return <span className="mx-1 text-muted-foreground/40">|</span>;
}

export function TokenDisplay({ tokens, durationMs, className = '' }: TokenDisplayProps) {
  return (
    <span className={`inline-flex items-center font-mono text-[10px] text-muted-foreground ${className}`}>
      <ArrowDownToLine className="mr-0.5 size-2.5" />
      <span title="Input tokens">{formatCount(tokens.input)}</span>
      <Separator />
      <Database className="mr-0.5 size-2.5" />
      <span title="Cached tokens">{formatCount(tokens.cached)}</span>
      <Separator />
      <ArrowUpFromLine className="mr-0.5 size-2.5" />
      <span title="Output tokens">{formatCount(tokens.output)}</span>
      {durationMs !== undefined && (
        <>
          <Separator />
          <Clock className="mr-0.5 size-2.5" />
          <span title="Processing time">{formatDuration(durationMs)}</span>
        </>
      )}
      {tokens.costUSD !== undefined && tokens.costUSD > 0 && (
        <>
          <Separator />
          <DollarSign className="mr-0.5 size-2.5" />
          <span title="Cost (USD)">{formatCost(tokens.costUSD)}</span>
        </>
      )}
    </span>
  );
}
