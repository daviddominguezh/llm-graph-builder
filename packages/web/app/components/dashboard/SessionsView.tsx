'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { fetchSessionsByAgent } from '@/app/actions/dashboard';
import type { SessionRow } from '@/app/lib/dashboard';

import { DeleteSessionDialog } from './DeleteSessionDialog';
import { FilterBar } from './FilterBar';
import { SearchBar } from './SearchBar';
import { buildSessionColumns } from './session-columns';
import { buildSessionFilterDefs } from './session-filters';
import { SortableTable } from './SortableTable';
import { useDashboardParams } from './useDashboardParams';

interface SessionsViewProps {
  orgId: string;
  agentId: string;
  slug: string;
  agentSlug: string;
  initialRows: SessionRow[];
  initialTotal: number;
}

const PAGE_SIZE = 50;

function computeTotalPages(totalCount: number): number {
  return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
}

export function SessionsView({
  orgId,
  agentId,
  slug,
  agentSlug,
  initialRows,
  initialTotal,
}: SessionsViewProps) {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    params, page, sortKey, sortDirection, filters, search,
    setSort, setPage, addFilter, removeFilter, clearFilters, setSearch,
  } = useDashboardParams('updated_at');

  const [rows, setRows] = useState<SessionRow[]>(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [deleteTarget, setDeleteTarget] = useState<SessionRow | null>(null);

  const refetchSessions = useCallback(() => {
    startTransition(async () => {
      const result = await fetchSessionsByAgent(orgId, agentId, params);
      setRows(result.rows);
      setTotalCount(result.totalCount);
    });
  }, [orgId, agentId, params, startTransition]);

  useEffect(() => {
    refetchSessions();
  }, [refetchSessions]);

  const handleDebug = useCallback(
    (row: SessionRow) => {
      router.push(`/orgs/${slug}/dashboard/${agentSlug}/sessions/${row.id}`);
    },
    [router, slug, agentSlug]
  );

  const handleDelete = useCallback((row: SessionRow) => {
    setDeleteTarget(row);
  }, []);

  const columns = useMemo(
    () => buildSessionColumns(t, { onDebug: handleDebug, onDelete: handleDelete }),
    [t, handleDebug, handleDelete]
  );
  const filterDefs = useMemo(() => buildSessionFilterDefs(t), [t]);
  const totalPages = computeTotalPages(totalCount);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <SearchBar value={search} onChange={setSearch} />
        <FilterBar
          definitions={filterDefs}
          active={filters}
          onAdd={addFilter}
          onRemove={removeFilter}
          onClear={clearFilters}
        />
      </div>
      <SortableTable<SessionRow>
        columns={columns}
        rows={rows}
        rowKey="id"
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={setSort}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        loading={isPending}
        emptyMessage={t('noSessions')}
      />
      {deleteTarget !== null && (
        <DeleteSessionDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          sessionId={deleteTarget.id}
          onDeleted={refetchSessions}
        />
      )}
    </div>
  );
}
