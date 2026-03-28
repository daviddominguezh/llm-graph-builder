import Link from 'next/link';

import type { TenantSummaryRow } from '@/app/lib/dashboard';

import type { Column } from './sortableTableTypes';

function formatCost(row: TenantSummaryRow): string {
  return '$' + row.total_cost.toFixed(5);
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
      key: 'unique_users',
      label: t('columns.uniqueUsers'),
      sortable: true,
      render: (row) => row.unique_users.toLocaleString(),
    },
  ];
}
