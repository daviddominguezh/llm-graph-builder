'use client';

import type { ExecutionSummaryRow } from '@/app/lib/dashboard';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

/* ─── Status icon ─── */

function StatusDot({ status }: { status: string }) {
  if (status === 'failed') return <CircleAlert className="size-3 text-destructive shrink-0" />;
  if (status === 'running') return <Clock className="size-3 text-amber-500 dark:text-amber-400 shrink-0" />;
  return <CircleCheck className="size-3 text-emerald-600 dark:text-emerald-400 shrink-0" />;
}

/* ─── Time formatting ─── */

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/* ─── Execution item ─── */

function ExecutionItem({ execution, index, selected, onSelect }: {
  execution: ExecutionSummaryRow;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('dashboard.debug');

  return (
    <div
      className={`cursor-pointer group flex flex-col justify-center py-1 rounded-[5px] ${selected ? 'bg-primary/15' : 'hover:bg-sidebar-accent'}`}
    >
      <button
        type="button"
        onClick={() => onSelect(execution.id)}
        className={`cursor-pointer w-full flex items-center gap-2 px-2 h-6 text-left rounded-none border-x-0 border-y-0 ${
          selected
            ? 'border-l border-l-2 border-primary text-primary'
            : 'border-l border-l-2 border-transparent group-hover:border-foreground text-muted-foreground hover:text-foreground'
        }`}
      >
        <StatusDot status={execution.status} />
        <span className={`text-[11px] truncate ${selected ? 'font-semibold' : 'font-normal'}`}>
          {t('executionN', { n: index + 1 })}
        </span>
        <span className="ml-auto text-[9px] text-muted-foreground tabular-nums shrink-0">
          {formatDate(execution.started_at)} {formatTime(execution.started_at)}
        </span>
      </button>
    </div>
  );
}

/* ─── Public component ─── */

interface ExecutionSidebarProps {
  executions: ExecutionSummaryRow[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function ExecutionSidebar({ executions, selectedId, onSelect }: ExecutionSidebarProps) {
  return (
    <div className="flex flex-col border-r bg-background shrink-0 w-56 overflow-y-auto p-1.5 gap-0.5">
      {[...executions].reverse().map((exec, i) => (
        <ExecutionItem
          key={exec.id}
          execution={exec}
          index={executions.length - 1 - i}
          selected={exec.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
