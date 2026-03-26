'use client';

import { useTranslations } from 'next-intl';

import type { NodeVisitRow } from '@/app/lib/dashboard';

interface TokenTableProps {
  visit: NodeVisitRow;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

export function TokenTable({ visit }: TokenTableProps) {
  const t = useTranslations('dashboard.debug');

  const rows = [
    { label: t('inputTokens'), value: visit.input_tokens.toLocaleString() },
    { label: t('outputTokens'), value: visit.output_tokens.toLocaleString() },
    { label: t('cachedTokens'), value: visit.cached_tokens.toLocaleString() },
    { label: t('cost'), value: formatCost(visit.cost) },
  ];

  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b last:border-0">
            <td className="py-1 pr-4 text-muted-foreground">{row.label}</td>
            <td className="py-1 text-right font-mono">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
