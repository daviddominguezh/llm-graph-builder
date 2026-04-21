'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface TablePaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function computeRange(page: number, pageSize: number, totalCount: number): { from: number; to: number } {
  const from = page * pageSize + 1;
  const to = Math.min(from + pageSize - 1, totalCount);
  return { from, to };
}

export function TablePagination({ page, pageSize, totalCount, totalPages, onPageChange }: TablePaginationProps) {
  const t = useTranslations('dashboard.pagination');
  const { from, to } = computeRange(page, pageSize, totalCount);
  const isFirst = page === 0;
  const isLast = page >= totalPages - 1;

  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {totalCount > 0 ? t('showing', { from, to, total: totalCount }) : t('noItems')}
      </span>
      <div className="flex items-center gap-1">
        <span className="mr-1 text-[11px] text-muted-foreground tabular-nums">
          {t('pageOf', { page: page + 1, total: totalPages })}
        </span>
        <Button variant="ghost" size="icon-xs" disabled={isFirst} onClick={() => onPageChange(0)}>
          <ChevronsLeft className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs" disabled={isFirst} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs" disabled={isLast} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs" disabled={isLast} onClick={() => onPageChange(totalPages - 1)}>
          <ChevronsRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
