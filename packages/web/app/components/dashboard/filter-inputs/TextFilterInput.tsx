'use client';

import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { ActiveFilter, FilterDefinition } from '../filter-bar-types';

interface TextFilterInputProps {
  definition: FilterDefinition;
  onApply: (filter: ActiveFilter) => void;
}

export function TextFilterInput({ definition, onApply }: TextFilterInputProps) {
  const t = useTranslations('dashboard.filters');
  const [value, setValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || value.trim() === '') return;
    onApply({
      key: definition.key,
      label: definition.label,
      value: value.trim(),
      displayValue: value.trim(),
    });
  };

  return (
    <div className="p-2">
      <Input
        placeholder={`${t('apply')}...`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
      />
    </div>
  );
}
