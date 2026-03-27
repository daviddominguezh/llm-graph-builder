'use client';

import { useMemo } from 'react';

import { TableBody, TableCell, TableRow } from '@/components/ui/table';

import type { Column } from './sortableTableTypes';

interface SortableTableBodyProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  rows: T[];
  rowKey: keyof T;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

function deduplicateRows<T extends Record<string, unknown>>(rows: T[], key: keyof T): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const k = String(row[key]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground rounded-b-md bg-card">
        {message}
      </TableCell>
    </TableRow>
  );
}

function getCellValue<T extends Record<string, unknown>>(row: T, col: Column<T>): React.ReactNode {
  if (col.render !== undefined) return col.render(row);
  const val = row[col.key];
  if (val === null || val === undefined) return '';
  return String(val);
}

export function SortableTableBody<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = 'No data',
}: SortableTableBodyProps<T>) {
  const uniqueRows = useMemo(() => deduplicateRows(rows, rowKey), [rows, rowKey]);

  if (uniqueRows.length === 0) {
    return (
      <TableBody>
        <EmptyRow colSpan={columns.length} message={emptyMessage} />
      </TableBody>
    );
  }

  return (
    <TableBody>
      {uniqueRows.map((row) => (
        <TableRow
          key={String(row[rowKey])}
          className={onRowClick !== undefined ? 'cursor-pointer' : ''}
          onClick={onRowClick !== undefined ? () => onRowClick(row) : undefined}
        >
          {columns.map((col) => (
            <TableCell key={col.key} className={col.className}>
              {getCellValue(row, col)}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}
