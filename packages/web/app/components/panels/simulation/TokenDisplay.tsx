'use client';

import type { SimulationTokens } from '../../../types/simulation';

interface TokenDisplayProps {
  tokens: SimulationTokens;
  className?: string;
}

export function TokenDisplay({ tokens, className = '' }: TokenDisplayProps) {
  return (
    <span className={`text-xs text-muted-foreground ${className}`}>
      <span title="Input tokens">In: {tokens.input.toLocaleString()}</span>
      {' / '}
      <span title="Output tokens">Out: {tokens.output.toLocaleString()}</span>
      {' / '}
      <span title="Cached tokens">Cache: {tokens.cached.toLocaleString()}</span>
    </span>
  );
}
