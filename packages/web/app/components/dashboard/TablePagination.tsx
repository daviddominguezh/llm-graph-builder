'use client';

import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface TablePaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function TablePagination({ page, totalPages, onPageChange }: TablePaginationProps) {
  const t = useTranslations('dashboard.pagination');

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-2 py-2">
      <span className="text-xs text-muted-foreground">
        {t('pageOf', { page: page + 1, total: totalPages })}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="xs" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          {t('previous')}
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          {t('next')}
        </Button>
      </div>
    </div>
  );
}
