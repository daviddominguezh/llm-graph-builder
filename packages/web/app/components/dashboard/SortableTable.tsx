'use client';

import { Table } from '@/components/ui/table';

import { SortableTableBody } from './SortableTableBody';
import { SortableTableHeader } from './SortableTableHeader';
import { TablePagination } from './TablePagination';
import type { SortableTableProps } from './sortableTableTypes';

export type { Column, SortableTableProps } from './sortableTableTypes';

export function SortableTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  sortKey,
  sortDirection,
  onSort,
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  onRowClick,
  loading,
  emptyMessage,
}: SortableTableProps<T>) {
  return (
    <div className={`flex h-full flex-col transition-opacity duration-200 ${loading === true ? 'pointer-events-none opacity-50' : ''}`}>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
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
      </div>
      <div className="shrink-0">
        <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} totalPages={totalPages} onPageChange={onPageChange} />
      </div>
    </div>
  );
}
