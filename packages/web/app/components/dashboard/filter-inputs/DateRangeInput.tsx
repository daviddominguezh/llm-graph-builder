'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ActiveFilter, FilterDefinition } from '../filterBarTypes';

interface DateRangeInputProps {
  definition: FilterDefinition;
  onApply: (filter: ActiveFilter) => void;
}

function formatDisplayValue(from: string, to: string): string {
  const parts: string[] = [];
  if (from !== '') parts.push(from);
  if (to !== '') parts.push(to);
  return parts.join(' - ');
}

export function DateRangeInput({ definition, onApply }: DateRangeInputProps) {
  const t = useTranslations('dashboard.filters');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const handleApply = () => {
    if (from === '' && to === '') return;
    onApply({
      key: definition.key,
      label: definition.label,
      value: { from, to },
      displayValue: formatDisplayValue(from, to),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs">{t('from')}</Label>
      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      <Label className="text-xs">{t('to')}</Label>
      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      <Button size="sm" onClick={handleApply} disabled={from === '' && to === ''}>
        {t('apply')}
      </Button>
    </div>
  );
}
