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
  search: string;
  setSort: (key: string) => void;
  setPage: (page: number) => void;
  addFilter: (filter: ActiveFilter) => void;
  removeFilter: (key: string) => void;
  clearFilters: () => void;
  setSearch: (search: string) => void;
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

function buildUrlParams(
  sortKey: string,
  sortDir: string,
  page: number,
  filters: ActiveFilter[],
  search: string
): string {
  const sp = new URLSearchParams();
  sp.set('sort', sortKey);
  sp.set('dir', sortDir);
  sp.set('page', String(page));
  if (filters.length > 0) sp.set('filters', JSON.stringify(filters));
  if (search !== '') sp.set('search', search);
  return sp.toString();
}

export function useDashboardParams(defaultSort: string): DashboardParamsState {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sortKey = searchParams.get('sort') ?? defaultSort;
  const sortDirection = (searchParams.get('dir') ?? 'desc') as 'asc' | 'desc';
  const page = Number(searchParams.get('page') ?? DEFAULT_PAGE);
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const search = searchParams.get('search') ?? '';

  const navigate = useCallback(
    (sort: string, dir: string, p: number, f: ActiveFilter[], s: string) => {
      router.push(`?${buildUrlParams(sort, dir, p, f, s)}`);
    },
    [router]
  );

  const setSort = useCallback(
    (key: string) => {
      const newDir = key === sortKey && sortDirection === 'desc' ? 'asc' : 'desc';
      navigate(key, newDir, DEFAULT_PAGE, filters, search);
    },
    [sortKey, sortDirection, filters, search, navigate]
  );

  const setPage = useCallback(
    (p: number) => {
      navigate(sortKey, sortDirection, p, filters, search);
    },
    [sortKey, sortDirection, filters, search, navigate]
  );

  const addFilter = useCallback(
    (filter: ActiveFilter) => {
      const next = [...filters.filter((f) => f.key !== filter.key), filter];
      navigate(sortKey, sortDirection, DEFAULT_PAGE, next, search);
    },
    [sortKey, sortDirection, filters, search, navigate]
  );

  const removeFilter = useCallback(
    (key: string) => {
      navigate(
        sortKey,
        sortDirection,
        DEFAULT_PAGE,
        filters.filter((f) => f.key !== key),
        search
      );
    },
    [sortKey, sortDirection, filters, search, navigate]
  );

  const clearFilters = useCallback(() => {
    navigate(sortKey, sortDirection, DEFAULT_PAGE, [], search);
  }, [sortKey, sortDirection, search, navigate]);

  const setSearch = useCallback(
    (s: string) => {
      navigate(sortKey, sortDirection, DEFAULT_PAGE, filters, s);
    },
    [sortKey, sortDirection, filters, navigate]
  );

  const params: DashboardParams = useMemo(
    () => ({
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      sortKey,
      sortDirection,
      filters: filtersToRecord(filters),
      search: search || undefined,
    }),
    [page, sortKey, sortDirection, filters, search]
  );

  return {
    params,
    page,
    sortKey,
    sortDirection,
    filters,
    search,
    setSort,
    setPage,
    addFilter,
    removeFilter,
    clearFilters,
    setSearch,
  };
}
