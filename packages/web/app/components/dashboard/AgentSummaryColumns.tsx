import Link from 'next/link';

import type { AgentSummaryRow } from '@/app/lib/dashboard';

import type { Column } from './sortableTableTypes';

function formatAvgCost(row: AgentSummaryRow): string {
  if (row.total_executions === 0) return '$0.00000';
  const avg = row.total_cost / row.total_executions;
  return '$' + avg.toFixed(5);
}

function formatCost(row: AgentSummaryRow): string {
  return '$' + row.total_cost.toFixed(5);
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const date = `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

export function buildAgentSummaryColumns(
  slug: string,
  t: (key: string) => string
): Column<AgentSummaryRow>[] {
  return [
    {
      key: 'agent_name',
      label: t('columns.agentName'),
      sortable: true,
      render: (row) => (
        <Link
          href={`/orgs/${slug}/dashboard/${row.agent_slug}`}
          className="font-medium text-primary hover:underline"
        >
          {row.agent_name}
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
      key: 'avg_cost',
      label: t('columns.avgCost'),
      sortable: false,
      render: formatAvgCost,
    },
    {
      key: 'total_cost',
      label: t('columns.totalCost'),
      sortable: true,
      render: formatCost,
    },
    {
      key: 'unique_tenants',
      label: t('columns.uniqueTenants'),
      sortable: true,
      render: (row) => row.unique_tenants.toLocaleString(),
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
