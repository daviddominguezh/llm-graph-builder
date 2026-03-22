import { Badge } from '@/components/ui/badge';

import type { SessionRow } from '@/app/lib/dashboard';

import type { Column } from './sortable-table-types';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

function channelBadge(row: SessionRow): React.ReactNode {
  return <Badge variant="secondary">{row.channel}</Badge>;
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
      render: channelBadge,
    },
    {
      key: 'current_node_id',
      label: t('columns.currentNode'),
      sortable: false,
      render: (row) => row.current_node_id,
    },
    {
      key: 'version',
      label: t('columns.version'),
      sortable: true,
      render: (row) => String(row.version),
    },
    {
      key: 'model',
      label: t('columns.model'),
      sortable: true,
      render: (row) => row.model,
    },
    {
      key: 'created_at',
      label: t('columns.created'),
      sortable: true,
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'updated_at',
      label: t('columns.lastActivity'),
      sortable: true,
      render: (row) => formatDate(row.updated_at),
    },
  ];
}
