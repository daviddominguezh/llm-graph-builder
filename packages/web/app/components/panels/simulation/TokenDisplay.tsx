'use client';

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

export function TokenDisplay({ tokens, durationMs, className = '' }: TokenDisplayProps) {
  return (
    <span className={`font-mono text-[10px] text-muted-foreground ${className}`}>
      <span title="Input tokens">&darr;{formatCount(tokens.input)}</span>
      {' '}
      <span title="Output tokens">&uarr;{formatCount(tokens.output)}</span>
      {' '}
      <span title="Cached tokens">{'\u23F8\uFE0E'}{formatCount(tokens.cached)}</span>
      {durationMs !== undefined && (
        <>
          {' '}
          <span title="Processing time">{formatDuration(durationMs)}</span>
        </>
      )}
    </span>
  );
}
