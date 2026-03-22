'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { fetchSessionsByAgent } from '@/app/actions/dashboard';
import type { SessionRow } from '@/app/lib/dashboard';

import { FilterBar } from './FilterBar';
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

  const { params, page, sortKey, sortDirection, filters, setSort, setPage, addFilter, removeFilter, clearFilters } =
    useDashboardParams('updated_at');

  const [rows, setRows] = useState<SessionRow[]>(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotal);

  useEffect(() => {
    startTransition(async () => {
      const result = await fetchSessionsByAgent(orgId, agentId, params);
      setRows(result.rows);
      setTotalCount(result.totalCount);
    });
  }, [orgId, agentId, params, startTransition]);

  const columns = useMemo(() => buildSessionColumns(t), [t]);
  const filterDefs = useMemo(() => buildSessionFilterDefs(t), [t]);
  const totalPages = computeTotalPages(totalCount);

  const handleRowClick = useCallback(
    (row: SessionRow) => {
      router.push(`/orgs/${slug}/dashboard/${agentSlug}/sessions/${row.id}`);
    },
    [router, slug, agentSlug]
  );

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        definitions={filterDefs}
        active={filters}
        onAdd={addFilter}
        onRemove={removeFilter}
        onClear={clearFilters}
      />
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
        onRowClick={handleRowClick}
        loading={isPending}
        emptyMessage={t('noSessions')}
      />
    </div>
  );
}
