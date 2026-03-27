import Link from 'next/link';

import type { TenantSummaryRow } from '@/app/lib/dashboard';

import type { Column } from './sortableTableTypes';

function formatCost(row: TenantSummaryRow): string {
  return '$' + row.total_cost.toFixed(5);
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const date = `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
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
      key: 'unique_agents',
      label: t('columns.uniqueAgents'),
      sortable: true,
      render: (row) => row.unique_agents.toLocaleString(),
    },
    {
      key: 'unique_users',
      label: t('columns.uniqueUsers'),
      sortable: true,
      render: (row) => row.unique_users.toLocaleString(),
    },
    {
      key: 'unique_sessions',
      label: t('columns.uniqueSessions'),
      sortable: true,
      render: (row) => row.unique_sessions.toLocaleString(),
    },
    {
      key: 'last_execution_at',
      label: t('columns.lastExecution'),
      sortable: true,
      render: (row) => formatDateTime(row.last_execution_at),
    },
  ];
}
