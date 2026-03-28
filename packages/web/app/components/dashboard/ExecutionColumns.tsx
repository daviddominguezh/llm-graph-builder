import type { TenantExecutionRow } from '@/app/lib/dashboard';
import { Button } from '@/components/ui/button';
import { Bug, CircleAlert, CircleCheck, Clock } from 'lucide-react';

import type { Column } from './sortableTableTypes';

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${String(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const date = `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

function truncateUuid(uuid: string): string {
  return uuid.slice(0, 8);
}

interface ExecutionColumnCallbacks {
  onDebug: (row: TenantExecutionRow) => void;
}

function StatusIcon({ status, t }: { status: string; t: (key: string) => string }) {
  if (status === 'failed') {
    return (
      <span title={t('columns.statusError')}>
        <CircleAlert className="size-4 text-destructive" />
      </span>
    );
  }

  if (status === 'running') {
    return (
      <span title={t('columns.statusRunning')}>
        <Clock className="size-4 text-amber-500 dark:text-amber-400" />
      </span>
    );
  }

  return (
    <span title={t('columns.statusCompleted')}>
      <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
    </span>
  );
}

function stopPropagation(e: React.MouseEvent) {
  e.stopPropagation();
}

function buildBaseColumns(t: (key: string) => string): Column<TenantExecutionRow>[] {
  return [
    {
      key: 'status',
      label: t('columns.status'),
      sortable: true,
      render: (row) => <StatusIcon status={row.status} t={t} />,
    },
    {
      key: 'agent_name',
      label: t('columns.agentName'),
      sortable: true,
      render: (row) => row.agent_name,
    },
    {
      key: 'session_id',
      label: t('columns.sessionId'),
      sortable: false,
      render: (row) => <span className="font-mono text-xs">{truncateUuid(row.session_id)}</span>,
    },
    {
      key: 'user_id',
      label: t('columns.userId'),
      sortable: true,
      render: (row) => row.user_id,
    },
    {
      key: 'channel',
      label: t('columns.channel'),
      sortable: true,
      render: (row) => <span className="font-mono text-xs">{row.channel.toUpperCase()}</span>,
    },
    {
      key: 'model',
      label: t('columns.model'),
      sortable: true,
      render: (row) => row.model,
    },
    {
      key: 'version',
      label: t('columns.version'),
      sortable: true,
      render: (row) => `v${String(row.version)}`,
    },
    {
      key: 'total_cost',
      label: t('columns.totalCost'),
      sortable: true,
      render: (row) => formatCost(row.total_cost),
    },
    {
      key: 'total_duration_ms',
      label: t('columns.totalDuration'),
      sortable: true,
      render: (row) => formatDuration(row.total_duration_ms),
    },
    {
      key: 'started_at',
      label: t('columns.started'),
      sortable: true,
      render: (row) => formatDateTime(row.started_at),
    },
  ];
}

function buildActionsColumn(
  t: (key: string) => string,
  callbacks: ExecutionColumnCallbacks
): Column<TenantExecutionRow> {
  return {
    key: 'actions',
    label: '',
    sortable: false,
    render: (row) => (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          className="text-accent hover:text-accent"
          size="icon"
          onClick={(e) => {
            stopPropagation(e);
            callbacks.onDebug(row);
          }}
          title={t('debugSession')}
        >
          <Bug className="size-4" />
        </Button>
      </div>
    ),
    className: 'w-16 text-right',
  };
}

export function buildExecutionColumns(
  t: (key: string) => string,
  callbacks?: ExecutionColumnCallbacks
): Column<TenantExecutionRow>[] {
  const columns = buildBaseColumns(t);

  if (callbacks !== undefined) {
    columns.push(buildActionsColumn(t, callbacks));
  }

  return columns;
}
