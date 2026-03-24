'use client';

import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronUp } from 'lucide-react';

import type { Column } from './sortableTableTypes';

interface SortableTableHeaderProps<T> {
  columns: Column<T>[];
  sortKey: string | null;
  sortDirection: 'asc' | 'desc';
  onSort: (key: string) => void;
}

function SortIcon({ direction }: { direction: 'asc' | 'desc' }) {
  return direction === 'asc' ? (
    <ChevronUp className="ml-1 inline size-3" />
  ) : (
    <ChevronDown className="ml-1 inline size-3" />
  );
}

export function SortableTableHeader<T>({
  columns,
  sortKey,
  sortDirection,
  onSort,
}: SortableTableHeaderProps<T>) {
  return (
    <TableHeader>
      <TableRow>
        {columns.map((col) => (
          <TableHead
            key={col.key}
            className={col.sortable === true ? 'cursor-pointer select-none' : ''}
            onClick={col.sortable === true ? () => onSort(col.key) : undefined}
          >
            {col.label}
            {col.sortable === true && sortKey === col.key && <SortIcon direction={sortDirection} />}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}
