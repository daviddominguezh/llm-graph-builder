import Link from 'next/link';

import type { AgentSummaryRow } from '@/app/lib/dashboard';

import type { Column } from './sortable-table-types';

function formatTokens(row: AgentSummaryRow): string {
  const total = row.total_input_tokens + row.total_output_tokens;
  return total.toLocaleString();
}

function formatCost(row: AgentSummaryRow): string {
  return '$' + row.total_cost.toFixed(2);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
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
      key: 'total_tokens',
      label: t('columns.totalTokens'),
      sortable: false,
      render: formatTokens,
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
      render: (row) => formatDate(row.last_execution_at),
    },
  ];
}
