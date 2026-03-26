'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { ActiveFilter, FilterDefinition } from '../filterBarTypes';

interface TextFilterInputProps {
  definition: FilterDefinition;
  onApply: (filter: ActiveFilter) => void;
}

export function TextFilterInput({ definition, onApply }: TextFilterInputProps) {
  const t = useTranslations('dashboard.filters');
  const [value, setValue] = useState('');

  const applyFilter = () => {
    if (value.trim() === '') return;
    onApply({
      key: definition.key,
      label: definition.label,
      value: value.trim(),
      displayValue: value.trim(),
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') applyFilter();
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder={`${definition.label}...`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      <Button size="sm" onClick={applyFilter} disabled={value.trim() === ''}>
        {t('apply')}
      </Button>
    </div>
  );
}
