'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { fetchTenantSummary } from '@/app/actions/dashboard';
import type { TenantSummaryRow } from '@/app/lib/dashboard';

import { FilterBar } from './FilterBar';
import { SortableTable } from './SortableTable';
import { TenantCharts } from './TenantCharts';
import { buildTenantSummaryColumns } from './TenantSummaryColumns';
import { buildTenantSummaryFilterDefs } from './tenantSummaryFilters';
import { useDashboardParams } from './useDashboardParams';

interface TenantSummaryViewProps {
  orgId: string;
  slug: string;
  initialRows: TenantSummaryRow[];
  initialTotal: number;
}

const PAGE_SIZE = 50;

function computeTotalPages(totalCount: number): number {
  return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
}

export function TenantSummaryView({ orgId, slug, initialRows, initialTotal }: TenantSummaryViewProps) {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { params, page, sortKey, sortDirection, filters, setSort, setPage, addFilter, removeFilter, clearFilters } =
    useDashboardParams('last_execution_at');

  const [rows, setRows] = useState<TenantSummaryRow[]>(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotal);

  useEffect(() => {
    startTransition(async () => {
      const result = await fetchTenantSummary(orgId, params);
      setRows(result.rows);
      setTotalCount(result.totalCount);
    });
  }, [orgId, params, startTransition]);

  const columns = useMemo(() => buildTenantSummaryColumns(slug, t), [slug, t]);
  const filterDefs = useMemo(() => buildTenantSummaryFilterDefs(t), [t]);
  const totalPages = computeTotalPages(totalCount);

  const handleRowClick = useCallback(
    (row: TenantSummaryRow) => {
      router.push(`/orgs/${slug}/dashboard/${encodeURIComponent(row.tenant_id)}`);
    },
    [router, slug]
  );

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="min-w-0">
        <TenantCharts rows={rows} />
      </div>
      <div className="min-w-0 flex flex-col gap-4">
        <FilterBar
          definitions={filterDefs}
          active={filters}
          onAdd={addFilter}
          onRemove={removeFilter}
          onClear={clearFilters}
        />
        <SortableTable<TenantSummaryRow>
          columns={columns}
          rows={rows}
          rowKey="tenant_id"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={setSort}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onRowClick={handleRowClick}
          loading={isPending}
          emptyMessage={t('empty')}
        />
      </div>
    </div>
  );
}
