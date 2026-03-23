import type { SessionRow } from '@/app/lib/dashboard';

import type { Column } from './sortable-table-types';

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const date = `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(5)}`;
}

export function buildSessionColumns(t: (key: string) => string): Column<SessionRow>[] {
  return [
    {
      key: 'tenant_id',
      label: t('columns.tenantId'),
      sortable: true,
      render: (row) => row.tenant_id,
    },
    {
      key: 'user_id',
      label: t('columns.userId'),
      sortable: true,
      render: (row) => row.user_id,
    },
    {
      key: 'session_id',
      label: t('columns.sessionId'),
      sortable: false,
      render: (row) => (
        <span className="font-mono text-xs">{row.session_id}</span>
      ),
    },
    {
      key: 'channel',
      label: t('columns.channel'),
      sortable: true,
      render: (row) => <span className="font-mono uppercase">{row.channel}</span>,
    },
    {
      key: 'current_node_id',
      label: t('columns.currentNode'),
      sortable: false,
      render: (row) => <span className="font-mono uppercase">{row.current_node_id}</span>,
    },
    {
      key: 'version',
      label: t('columns.version'),
      sortable: true,
      render: (row) => `v${String(row.version)}`,
    },
    {
      key: 'model',
      label: t('columns.model'),
      sortable: true,
      render: (row) => row.model,
    },
    {
      key: 'total_cost',
      label: t('columns.totalCost'),
      sortable: true,
      render: (row) => formatCost(row.total_cost),
    },
    {
      key: 'updated_at',
      label: t('columns.lastActivity'),
      sortable: true,
      render: (row) => formatDateTime(row.updated_at),
    },
  ];
}
