'use client';

import { useMemo, useState } from 'react';

import { Bug, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { TenantExecutionRow } from '@/app/lib/dashboard';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import type { SessionGroup } from './executionGrouping';
import { groupExecutions } from './executionGrouping';

/* ─── Constants ─── */

const GROUPS_PER_PAGE = 20;
const SINGLE_GROUP = 1;
const COL_SPAN = 9;

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
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  const hr = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${mo}/${dy} ${hr}:${mn}`;
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

function InnerRow({ exec, onDebug }: { exec: TenantExecutionRow; onDebug: (row: TenantExecutionRow) => void }) {
  const t = useTranslations('dashboard');
  return (
    <TableRow className="border-border/40">
      <TableCell className="text-center px-3">
        <div className="flex justify-center"><StatusIcon status={exec.status} t={t} /></div>
      </TableCell>
      <TableCell className="px-3 font-mono text-xs">{exec.model}</TableCell>
      <TableCell className="text-center px-3 tabular-nums">{formatCost(exec.total_cost)}</TableCell>
      <TableCell className="text-center px-3 tabular-nums">{formatDuration(exec.total_duration_ms)}</TableCell>
      <TableCell className="text-center px-3 tabular-nums">{formatDateTime(exec.started_at)}</TableCell>
      <TableCell className="px-3">
        <Button variant="ghost" className="text-accent hover:text-accent" size="icon" onClick={() => onDebug(exec)} title={t('debugSession')}>
          <Bug className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function InnerTable({ executions, onDebug }: { executions: TenantExecutionRow[]; onDebug: (row: TenantExecutionRow) => void }) {
  const t = useTranslations('dashboard');

  return (
    <div className="ml-8 mb-3 mt-0 border-0 border-l-2 border-l-accent overflow-hidden">
      <Table>
        <TableHeader className="bg-sidebar">
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-center px-3">{t('columns.status')}</TableHead>
            <TableHead className="px-3">{t('columns.model')}</TableHead>
            <TableHead className="text-center px-3">{t('columns.cost')}</TableHead>
            <TableHead className="text-center px-3">{t('columns.totalDuration')}</TableHead>
            <TableHead className="text-center px-3">{t('columns.started')}</TableHead>
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

/* ─── Master row ─── */

function truncateSession(id: string): string {
  const MAX_LEN = 12;
  return id.length > MAX_LEN ? `${id.slice(0, MAX_LEN)}\u2026` : id;
}

function MasterRow({ group, expanded, onToggle, onDebug }: {
  group: SessionGroup;
  expanded: boolean;
  onToggle: () => void;
  onDebug: (row: TenantExecutionRow) => void;
}) {
  const t = useTranslations('dashboard');

  return (
    <>
      <TableRow className="cursor-pointer transition-colors hover:bg-muted/50" onClick={onToggle}>
        <TableCell className="text-center px-4 pl-5">
          <ChevronRight className={`size-3.5 text-muted-foreground transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
        </TableCell>
        <TableCell className="text-center px-4">
          <div className="flex justify-center"><StatusIcon status={group.lastStatus} t={t} /></div>
        </TableCell>
        <TableCell className="text-center px-4">
          <span className="font-mono text-xs">{group.channel.toUpperCase()}</span>
        </TableCell>
        <TableCell className="px-4">
          {group.agent_name} <span className="text-muted-foreground">v{String(group.version)}</span>
        </TableCell>
        <TableCell className="px-4">{group.user_id}</TableCell>
        <TableCell className="px-4">
          <span className="font-mono text-xs" title={group.session_id}>{truncateSession(group.session_id)}</span>
        </TableCell>
        <TableCell className="text-center px-4 tabular-nums">{group.executionCount}</TableCell>
        <TableCell className="text-center px-4 tabular-nums">{formatCost(group.totalCost)}</TableCell>
        <TableCell className="text-center px-4 pr-5 tabular-nums">{formatDateTime(group.lastExecution)}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="border-0 hover:bg-transparent">
          <TableCell colSpan={COL_SPAN} className="p-0 bg-muted/10">
            <InnerTable executions={group.executions} onDebug={onDebug} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/* ─── Pagination ─── */

interface PaginationProps {
  page: number;
  totalPages: number;
  totalGroups: number;
  totalRows: number;
  onPageChange: (page: number) => void;
}

function GroupPagination({ page, totalPages, totalGroups, totalRows, onPageChange }: PaginationProps) {
  const t = useTranslations('dashboard.pagination');
  const isFirst = page === 0;
  const isLast = page >= totalPages - 1;

  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {totalRows > 0
          ? t('showingSessions', { sessions: totalGroups, executions: totalRows })
          : t('noItems')}
      </span>
      <div className="flex items-center gap-1">
        <span className="mr-1 text-[11px] text-muted-foreground tabular-nums">
          {t('pageOf', { page: page + 1, total: totalPages })}
        </span>
        <Button variant="ghost" size="icon-xs" disabled={isFirst} onClick={() => onPageChange(0)}>
          <ChevronsLeft className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs" disabled={isFirst} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs" disabled={isLast} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs" disabled={isLast} onClick={() => onPageChange(totalPages - 1)}>
          <ChevronsRight className="size-3.5" />
        </Button>
      </div>
    </div>
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
  const [page, setPageRaw] = useState(0);

  const safePage = useMemo(() => {
    const maxPage = Math.max(0, Math.ceil(groups.length / GROUPS_PER_PAGE) - 1);
    return Math.min(page, maxPage);
  }, [page, groups.length]);

  const totalPages = Math.max(1, Math.ceil(groups.length / GROUPS_PER_PAGE));
  const pageGroups = useMemo(() => {
    const start = safePage * GROUPS_PER_PAGE;
    return groups.slice(start, start + GROUPS_PER_PAGE);
  }, [groups, safePage]);

  const autoExpand = groups.length === SINGLE_GROUP && groups[0] !== undefined;
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const effectiveExpanded = useMemo(() => {
    if (autoExpand && groups[0] !== undefined) {
      const merged = new Set(expandedKeys);
      merged.add(groups[0].key);
      return merged;
    }
    return expandedKeys;
  }, [autoExpand, groups, expandedKeys]);

  const toggle = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className={`flex h-full flex-col transition-opacity duration-200 ${loading === true ? 'pointer-events-none opacity-50' : ''}`}>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-sidebar sticky top-0 z-10">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8 px-4 pl-5" />
              <TableHead className="text-center px-4">{t('columns.lastStatus')}</TableHead>
              <TableHead className="text-center px-4">{t('columns.channel')}</TableHead>
              <TableHead className="px-4">{t('columns.agentName')}</TableHead>
              <TableHead className="px-4">{t('columns.userId')}</TableHead>
              <TableHead className="px-4">{t('columns.sessionId')}</TableHead>
              <TableHead className="text-center px-4">{t('columns.executions')}</TableHead>
              <TableHead className="text-center px-4">{t('columns.totalCost')}</TableHead>
              <TableHead className="text-center px-4 pr-5">{t('columns.lastExecution')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COL_SPAN} className="h-24 text-center text-muted-foreground">{emptyMessage}</TableCell>
              </TableRow>
            ) : (
              pageGroups.map((group) => (
                <MasterRow
                  key={group.key}
                  group={group}
                  expanded={effectiveExpanded.has(group.key)}
                  onToggle={() => toggle(group.key)}
                  onDebug={onDebug}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="shrink-0">
        <GroupPagination
          page={safePage}
          totalPages={totalPages}
          totalGroups={groups.length}
          totalRows={rows.length}
          onPageChange={setPageRaw}
        />
      </div>
    </div>
  );
}
