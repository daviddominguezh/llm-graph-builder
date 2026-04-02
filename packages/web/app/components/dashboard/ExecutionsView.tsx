'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { fetchExecutionsByTenant } from '@/app/actions/dashboard';
import type { DashboardParams, TenantExecutionRow } from '@/app/lib/dashboard';

import { buildExecutionFilterDefs } from './executionFilters';
import type { SessionGroup } from './executionGrouping';
import { FilterBar } from './FilterBar';
import { GroupedExecutionsTable } from './GroupedExecutionsTable';
import { SearchBar } from './SearchBar';
import { useDashboardParams } from './useDashboardParams';

interface ExecutionsViewProps {
  orgId: string;
  tenantId: string;
  tenantSlug: string;
  slug: string;
  initialRows: TenantExecutionRow[];
  initialTotal: number;
}

const PAGE_SIZE = 200;

function useExecutionData(orgId: string, tenantId: string, params: DashboardParams, initial: TenantExecutionRow[]) {
  const [rows, setRows] = useState<TenantExecutionRow[]>(initial);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await fetchExecutionsByTenant(orgId, tenantId, params);
      setRows(result.rows);
    });
  }, [orgId, tenantId, params, startTransition]);

  return { rows, isPending };
}

export function ExecutionsView({ orgId, tenantId, tenantSlug, slug, initialRows }: ExecutionsViewProps) {
  const t = useTranslations('dashboard');
  const router = useRouter();

  const { params, filters, search, addFilter, removeFilter, clearFilters, setSearch } =
    useDashboardParams('started_at');

  const fetchParams = useMemo(() => ({ ...params, pageSize: PAGE_SIZE }), [params]);
  const { rows, isPending } = useExecutionData(orgId, tenantId, fetchParams, initialRows);
  const filterDefs = buildExecutionFilterDefs(t);

  const handleDebug = useCallback(
    (group: SessionGroup) => {
      const encodedTenant = encodeURIComponent(tenantSlug);
      router.push(`/orgs/${slug}/dashboard/${encodedTenant}/sessions/${group.session_db_id}`);
    },
    [router, slug, tenantSlug]
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="shrink-0 flex items-center gap-3">
        <SearchBar value={search} onChange={setSearch} />
        <FilterBar
          definitions={filterDefs}
          active={filters}
          onAdd={addFilter}
          onRemove={removeFilter}
          onClear={clearFilters}
        />
      </div>
      <GroupedExecutionsTable
        rows={rows}
        loading={isPending}
        emptyMessage={t('noExecutions')}
        onDebug={handleDebug}
      />
    </div>
  );
}
