'use client';

import { useMemo, useState } from 'react';

import { Bug, ChevronRight, CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { TenantExecutionRow } from '@/app/lib/dashboard';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import type { SessionGroup } from './executionGrouping';
import { groupExecutions } from './executionGrouping';

/* ─── Formatters ─── */

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${String(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const date = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

/* ─── Status icon ─── */

function StatusIcon({ status, t }: { status: string; t: (key: string) => string }) {
  if (status === 'failed') {
    return <span title={t('columns.statusError')}><CircleAlert className="size-3.5 text-destructive" /></span>;
  }
  if (status === 'running') {
    return <span title={t('columns.statusRunning')}><Clock className="size-3.5 text-amber-500 dark:text-amber-400" /></span>;
  }
  return <span title={t('columns.statusCompleted')}><CircleCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" /></span>;
}

/* ─── Inner execution table ─── */

interface InnerTableProps {
  executions: TenantExecutionRow[];
  onDebug: (row: TenantExecutionRow) => void;
}

function InnerTable({ executions, onDebug }: InnerTableProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="pl-8 pr-2 pb-3">
      <Table>
        <TableHeader className="bg-sidebar">
          <TableRow>
            <TableHead className="text-center px-3">{t('columns.status')}</TableHead>
            <TableHead className="px-3">{t('columns.model')}</TableHead>
            <TableHead className="px-3">{t('columns.totalCost')}</TableHead>
            <TableHead className="text-center px-3">{t('columns.totalDuration')}</TableHead>
            <TableHead className="px-3">{t('columns.started')}</TableHead>
            <TableHead className="px-3 w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {executions.map((exec) => (
            <InnerRow key={exec.id} exec={exec} onDebug={onDebug} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function InnerRow({ exec, onDebug }: { exec: TenantExecutionRow; onDebug: (row: TenantExecutionRow) => void }) {
  const t = useTranslations('dashboard');
  return (
    <TableRow className="border-border/40">
      <TableCell className="text-center px-3">
        <div className="flex justify-center"><StatusIcon status={exec.status} t={t} /></div>
      </TableCell>
      <TableCell className="px-3 font-mono text-xs">{exec.model}</TableCell>
      <TableCell className="px-3 tabular-nums">{formatCost(exec.total_cost)}</TableCell>
      <TableCell className="text-center px-3 tabular-nums">{formatDuration(exec.total_duration_ms)}</TableCell>
      <TableCell className="px-3 tabular-nums">{formatDateTime(exec.started_at)}</TableCell>
      <TableCell className="px-3">
        <Button variant="ghost" className="text-accent hover:text-accent" size="icon" onClick={() => onDebug(exec)} title={t('debugSession')}>
          <Bug className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

/* ─── Master row ─── */

interface MasterRowProps {
  group: SessionGroup;
  expanded: boolean;
  onToggle: () => void;
  onDebug: (row: TenantExecutionRow) => void;
}

function MasterRow({ group, expanded, onToggle, onDebug }: MasterRowProps) {
  const t = useTranslations('dashboard');

  return (
    <>
      <TableRow
        className="cursor-pointer transition-colors hover:bg-muted/50"
        onClick={onToggle}
      >
        <TableCell className="text-center px-4 pl-5">
          <ChevronRight className={`size-3.5 text-muted-foreground transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
        </TableCell>
        <TableCell className="text-center px-4">
          <div className="flex justify-center"><StatusIcon status={group.lastStatus} t={t} /></div>
        </TableCell>
        <TableCell className="text-center px-4">
          <span className="font-mono text-xs">{group.channel.toUpperCase()}</span>
        </TableCell>
        <TableCell className="px-4">{group.agent_name}</TableCell>
        <TableCell className="text-center px-4">{`v${String(group.version)}`}</TableCell>
        <TableCell className="px-4">{group.user_id}</TableCell>
        <TableCell className="px-4">
          <span className="font-mono text-xs">{group.session_id.slice(0, 8)}</span>
        </TableCell>
        <TableCell className="text-center px-4 tabular-nums">{group.executionCount}</TableCell>
        <TableCell className="px-4 tabular-nums">{formatDateTime(group.firstExecution)}</TableCell>
        <TableCell className="px-4 pr-5 tabular-nums">{formatDateTime(group.lastExecution)}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={10} className="p-0 bg-muted/20">
            <InnerTable executions={group.executions} onDebug={onDebug} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/* ─── Public component ─── */

interface GroupedExecutionsTableProps {
  rows: TenantExecutionRow[];
  loading?: boolean;
  emptyMessage: string;
  onDebug: (row: TenantExecutionRow) => void;
}

export function GroupedExecutionsTable({ rows, loading, emptyMessage, onDebug }: GroupedExecutionsTableProps) {
  const t = useTranslations('dashboard');
  const groups = useMemo(() => groupExecutions(rows), [rows]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className={`transition-opacity duration-200 ${loading === true ? 'pointer-events-none opacity-50' : ''}`}>
      <Table>
        <TableHeader className="bg-sidebar sticky top-0 z-10">
          <TableRow>
            <TableHead className="w-8 px-4 pl-5" />
            <TableHead className="text-center px-4">{t('columns.lastStatus')}</TableHead>
            <TableHead className="text-center px-4">{t('columns.channel')}</TableHead>
            <TableHead className="px-4">{t('columns.agentName')}</TableHead>
            <TableHead className="text-center px-4">{t('columns.version')}</TableHead>
            <TableHead className="px-4">{t('columns.userId')}</TableHead>
            <TableHead className="px-4">{t('columns.sessionId')}</TableHead>
            <TableHead className="text-center px-4">{t('columns.executions')}</TableHead>
            <TableHead className="px-4">{t('columns.firstExecution')}</TableHead>
            <TableHead className="px-4 pr-5">{t('columns.lastExecution')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">{emptyMessage}</TableCell>
            </TableRow>
          ) : (
            groups.map((group) => (
              <MasterRow
                key={group.key}
                group={group}
                expanded={expandedKeys.has(group.key)}
                onToggle={() => toggle(group.key)}
                onDebug={onDebug}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
