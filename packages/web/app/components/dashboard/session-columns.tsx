import type { SessionRow } from '@/app/lib/dashboard';
import { Button } from '@/components/ui/button';
import { Bug, Trash2 } from 'lucide-react';

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

interface SessionColumnCallbacks {
  onDebug: (row: SessionRow) => void;
  onDelete: (row: SessionRow) => void;
}

function stopPropagation(e: React.MouseEvent) {
  e.stopPropagation();
}

function ActionsCell(row: SessionRow, t: (key: string) => string, callbacks: SessionColumnCallbacks) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          stopPropagation(e);
          callbacks.onDebug(row);
        }}
        title={t('debugSession')}
      >
        <Bug className="size-4" />
      </Button>
      <Button
        variant="destructive"
        size="icon"
        onClick={(e) => {
          stopPropagation(e);
          callbacks.onDelete(row);
        }}
        title={t('deleteSession')}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

export function buildSessionColumns(
  t: (key: string) => string,
  callbacks?: SessionColumnCallbacks
): Column<SessionRow>[] {
  const columns: Column<SessionRow>[] = [
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
      render: (row) => <span className="font-mono text-xs">{row.session_id}</span>,
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

  if (callbacks !== undefined) {
    columns.push({
      key: 'actions',
      label: t('actions'),
      sortable: false,
      render: (row) => ActionsCell(row, t, callbacks),
      className: 'w-20 text-right',
    });
  }

  return columns;
}
