'use client';

import { ArrowDownToLine, ArrowUpFromLine, Clock, Database } from 'lucide-react';

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
    </span>
  );
}
