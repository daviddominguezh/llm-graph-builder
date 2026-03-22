'use client';

import type { DashboardParams } from '@/app/lib/dashboard';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import type { ActiveFilter } from './filter-bar-types';

const DEFAULT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 50;

interface DashboardParamsState {
  params: DashboardParams;
  page: number;
  sortKey: string;
  sortDirection: 'asc' | 'desc';
  filters: ActiveFilter[];
  setSort: (key: string) => void;
  setPage: (page: number) => void;
  addFilter: (filter: ActiveFilter) => void;
  removeFilter: (key: string) => void;
  clearFilters: () => void;
}

function parseFilters(sp: URLSearchParams): ActiveFilter[] {
  const raw = sp.get('filters');
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ActiveFilter[];
  } catch {
    return [];
  }
}

function filtersToRecord(filters: ActiveFilter[]): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {};
  for (const f of filters) {
    record[f.key] = typeof f.value === 'string' ? f.value : String(f.value);
  }
  return record;
}

function buildSearchString(sortKey: string, sortDir: string, page: number, filters: ActiveFilter[]): string {
  const sp = new URLSearchParams();
  sp.set('sort', sortKey);
  sp.set('dir', sortDir);
  sp.set('page', String(page));
  if (filters.length > 0) {
    sp.set('filters', JSON.stringify(filters));
  }
  return sp.toString();
}

export function useDashboardParams(defaultSort: string): DashboardParamsState {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sortKey = searchParams.get('sort') ?? defaultSort;
  const sortDirection = (searchParams.get('dir') ?? 'desc') as 'asc' | 'desc';
  const page = Number(searchParams.get('page') ?? DEFAULT_PAGE);
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const navigate = useCallback(
    (sort: string, dir: string, p: number, f: ActiveFilter[]) => {
      router.push(`?${buildSearchString(sort, dir, p, f)}`);
    },
    [router]
  );

  const setSort = useCallback(
    (key: string) => {
      const newDir = key === sortKey && sortDirection === 'desc' ? 'asc' : 'desc';
      navigate(key, newDir, DEFAULT_PAGE, filters);
    },
    [sortKey, sortDirection, filters, navigate]
  );

  const setPage = useCallback(
    (p: number) => {
      navigate(sortKey, sortDirection, p, filters);
    },
    [sortKey, sortDirection, filters, navigate]
  );

  const addFilter = useCallback(
    (filter: ActiveFilter) => {
      const next = [...filters.filter((f) => f.key !== filter.key), filter];
      navigate(sortKey, sortDirection, DEFAULT_PAGE, next);
    },
    [sortKey, sortDirection, filters, navigate]
  );

  const removeFilter = useCallback(
    (key: string) => {
      navigate(
        sortKey,
        sortDirection,
        DEFAULT_PAGE,
        filters.filter((f) => f.key !== key)
      );
    },
    [sortKey, sortDirection, filters, navigate]
  );

  const clearFilters = useCallback(() => {
    navigate(sortKey, sortDirection, DEFAULT_PAGE, []);
  }, [sortKey, sortDirection, navigate]);

  const params: DashboardParams = useMemo(
    () => ({
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      sortKey,
      sortDirection,
      filters: filtersToRecord(filters),
    }),
    [page, sortKey, sortDirection, filters]
  );

  return {
    params,
    page,
    sortKey,
    sortDirection,
    filters,
    setSort,
    setPage,
    addFilter,
    removeFilter,
    clearFilters,
  };
}
