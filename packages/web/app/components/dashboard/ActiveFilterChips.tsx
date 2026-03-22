'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ActiveFilter } from './filter-bar-types';

interface ActiveFilterChipsProps {
  filters: ActiveFilter[];
  onRemove: (key: string) => void;
  onClear: () => void;
}

export function ActiveFilterChips({ filters, onRemove, onClear }: ActiveFilterChipsProps) {
  const t = useTranslations('dashboard.filters');

  if (filters.length === 0) return null;

  return (
    <>
      {filters.map((f) => (
        <Badge key={f.key} variant="secondary" className="gap-1">
          <span className="font-medium">{f.label}:</span> {f.displayValue}
          <button type="button" className="ml-0.5 hover:text-foreground" onClick={() => onRemove(f.key)}>
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="xs" onClick={onClear}>
        {t('clearAll')}
      </Button>
    </>
  );
}
