'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { fetchExecutionsByTenant } from '@/app/actions/dashboard';
import type { TenantExecutionRow } from '@/app/lib/dashboard';

import { buildExecutionColumns } from './ExecutionColumns';
import { buildExecutionFilterDefs } from './executionFilters';
import { FilterBar } from './FilterBar';
import { SearchBar } from './SearchBar';
import { SortableTable } from './SortableTable';
import { useDashboardParams } from './useDashboardParams';

interface ExecutionsViewProps {
  orgId: string;
  tenantId: string;
  slug: string;
  initialRows: TenantExecutionRow[];
  initialTotal: number;
}

const PAGE_SIZE = 50;

function computeTotalPages(totalCount: number): number {
  return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
}

export function ExecutionsView({ orgId, tenantId, slug, initialRows, initialTotal }: ExecutionsViewProps) {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    params, page, sortKey, sortDirection, filters, search,
    setSort, setPage, addFilter, removeFilter, clearFilters, setSearch,
  } = useDashboardParams('started_at');

  const [rows, setRows] = useState<TenantExecutionRow[]>(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotal);

  useEffect(() => {
    startTransition(async () => {
      const result = await fetchExecutionsByTenant(orgId, tenantId, params);
      setRows(result.rows);
      setTotalCount(result.totalCount);
    });
  }, [orgId, tenantId, params, startTransition]);

  const handleDebug = useCallback(
    (row: TenantExecutionRow) => {
      const encodedTenant = encodeURIComponent(tenantId);
      router.push(`/orgs/${slug}/dashboard/${encodedTenant}/sessions/${row.session_id}`);
    },
    [router, slug, tenantId]
  );

  const columns = useMemo(
    () => buildExecutionColumns(t, { onDebug: handleDebug }),
    [t, handleDebug]
  );
  const filterDefs = useMemo(() => buildExecutionFilterDefs(t), [t]);
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
      <SortableTable<TenantExecutionRow>
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
        emptyMessage={t('noExecutions')}
      />
    </div>
  );
}
