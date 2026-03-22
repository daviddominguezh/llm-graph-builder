'use client';

import { Table } from '@/components/ui/table';

import { SortableTableBody } from './SortableTableBody';
import { SortableTableHeader } from './SortableTableHeader';
import { TablePagination } from './TablePagination';
import type { SortableTableProps } from './sortable-table-types';

export type { Column, SortableTableProps } from './sortable-table-types';

export function SortableTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  sortKey,
  sortDirection,
  onSort,
  page,
  totalPages,
  onPageChange,
  onRowClick,
  loading,
  emptyMessage,
}: SortableTableProps<T>) {
  return (
    <div className={loading === true ? 'pointer-events-none opacity-50' : ''}>
      <Table>
        <SortableTableHeader
          columns={columns}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={onSort}
        />
        <SortableTableBody
          columns={columns}
          rows={rows}
          rowKey={rowKey}
          onRowClick={onRowClick}
          emptyMessage={emptyMessage}
        />
      </Table>
      <TablePagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}
