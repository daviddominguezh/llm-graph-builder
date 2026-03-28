import Link from 'next/link';

import type { TenantSummaryRow } from '@/app/lib/dashboard';

import type { Column } from './sortableTableTypes';

function formatCost(row: TenantSummaryRow): string {
  if (row.total_cost < 0.01) return '$' + row.total_cost.toFixed(4);
  return '$' + row.total_cost.toFixed(2);
}

function formatSuccessRate(row: TenantSummaryRow): string {
  if (row.total_executions === 0) return '—';
  const rate = ((row.total_executions - row.failed_executions) / row.total_executions) * 100;
  return `${rate.toFixed(1)}%`;
}

export function buildTenantSummaryColumns(
  slug: string,
  t: (key: string) => string
): Column<TenantSummaryRow>[] {
  return [
    {
      key: 'tenant_id',
      label: t('columns.tenantId'),
      sortable: true,
      render: (row) => (
        <Link
          href={`/orgs/${slug}/dashboard/${encodeURIComponent(row.tenant_id)}`}
          className="font-medium text-primary hover:underline"
        >
          {row.tenant_id}
        </Link>
      ),
    },
    {
      key: 'total_executions',
      label: t('columns.totalExecutions'),
      sortable: true,
      render: (row) => row.total_executions.toLocaleString(),
    },
    {
      key: 'total_cost',
      label: t('columns.totalCost'),
      sortable: true,
      render: formatCost,
    },
    {
      key: 'failed_executions',
      label: t('columns.successRate'),
      sortable: true,
      render: formatSuccessRate,
    },
  ];
}
