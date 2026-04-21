'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { fetchAgentSummary } from '@/app/actions/dashboard';
import type { AgentSummaryRow } from '@/app/lib/dashboard';

import { buildAgentSummaryColumns } from './AgentSummaryColumns';
import { buildAgentSummaryFilterDefs } from './agentSummaryFilters';
import { FilterBar } from './FilterBar';
import { SortableTable } from './SortableTable';
import { useDashboardParams } from './useDashboardParams';

interface AgentSummaryViewProps {
  orgId: string;
  slug: string;
  initialRows: AgentSummaryRow[];
  initialTotal: number;
}

const PAGE_SIZE = 50;

function computeTotalPages(totalCount: number): number {
  return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
}

export function AgentSummaryView({ orgId, slug, initialRows, initialTotal }: AgentSummaryViewProps) {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { params, page, sortKey, sortDirection, filters, setSort, setPage, addFilter, removeFilter, clearFilters } =
    useDashboardParams('last_execution_at');

  const [rows, setRows] = useState<AgentSummaryRow[]>(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotal);

  useEffect(() => {
    startTransition(async () => {
      const result = await fetchAgentSummary(orgId, params);
      setRows(result.rows);
      setTotalCount(result.totalCount);
    });
  }, [orgId, params, startTransition]);

  const columns = useMemo(() => buildAgentSummaryColumns(slug, t), [slug, t]);
  const filterDefs = useMemo(() => buildAgentSummaryFilterDefs(t), [t]);
  const totalPages = computeTotalPages(totalCount);

  const handleRowClick = useCallback(
    (row: AgentSummaryRow) => {
      router.push(`/orgs/${slug}/dashboard/${row.agent_slug}`);
    },
    [router, slug]
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
      <SortableTable<AgentSummaryRow>
        columns={columns}
        rows={rows}
        rowKey="agent_id"
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
  );
}
