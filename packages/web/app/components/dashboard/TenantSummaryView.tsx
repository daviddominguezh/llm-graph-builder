'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { fetchDashboardTimeSeries, fetchTenantSummary } from '@/app/actions/dashboard';
import type { TenantSummaryRow, TimeSeriesPoint } from '@/app/lib/dashboard';

import { DashboardTimeSeries } from './DashboardTimeSeries';
import { SortableTable } from './SortableTable';
import { buildTenantSummaryColumns } from './TenantSummaryColumns';
import { useDashboardParams } from './useDashboardParams';

interface TenantSummaryViewProps {
  orgId: string;
  slug: string;
  initialRows: TenantSummaryRow[];
  initialTotal: number;
  initialTimeSeries: TimeSeriesPoint[];
}

const PAGE_SIZE = 50;

function computeTotalPages(totalCount: number): number {
  return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
}

export function TenantSummaryView({
  orgId,
  slug,
  initialRows,
  initialTotal,
  initialTimeSeries,
}: TenantSummaryViewProps) {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { params, page, sortKey, sortDirection, setSort, setPage } =
    useDashboardParams('last_execution_at');

  const [rows, setRows] = useState<TenantSummaryRow[]>(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesPoint[]>(initialTimeSeries);
  const tsLoaded = timeSeriesData.length > 0 || initialTimeSeries.length > 0;

  useEffect(() => {
    startTransition(async () => {
      const result = await fetchTenantSummary(orgId, params);
      setRows(result.rows);
      setTotalCount(result.totalCount);
    });
  }, [orgId, params, startTransition]);

  useEffect(() => {
    let cancelled = false;
    void fetchDashboardTimeSeries(orgId).then((result) => {
      if (cancelled) return;
      if (result.error === null) setTimeSeriesData(result.rows);
    });
    return () => { cancelled = true; };
  }, [orgId]);

  const columns = useMemo(() => buildTenantSummaryColumns(slug, t), [slug, t]);
  const totalPages = computeTotalPages(totalCount);

  const handleRowClick = useCallback(
    (row: TenantSummaryRow) => {
      router.push(`/orgs/${slug}/dashboard/${encodeURIComponent(row.tenant_id)}`);
    },
    [router, slug]
  );

  return (
    <div className="grid h-full grid-cols-2 gap-3">
      <div className="min-w-0 overflow-hidden">
        <DashboardTimeSeries tenantRows={rows} timeSeriesData={timeSeriesData} loading={!tsLoaded} />
      </div>
      <div className="min-w-0">
        <SortableTable<TenantSummaryRow>
          columns={columns}
          rows={rows}
          rowKey="tenant_id"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={setSort}
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
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
