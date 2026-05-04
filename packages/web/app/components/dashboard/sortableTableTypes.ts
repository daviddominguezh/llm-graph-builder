import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  className?: string;
}

export interface SortableTableProps<T extends Record<string, unknown>> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: keyof T;
  sortKey: string | null;
  sortDirection: 'asc' | 'desc';
  onSort: (key: string) => void;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
}
