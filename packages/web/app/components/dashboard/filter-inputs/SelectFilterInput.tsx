'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ActiveFilter, FilterDefinition } from '../filter-bar-types';

interface SelectFilterInputProps {
  definition: FilterDefinition;
  onApply: (filter: ActiveFilter) => void;
}

export function SelectFilterInput({ definition, onApply }: SelectFilterInputProps) {
  const t = useTranslations('dashboard.filters');
  const [selected, setSelected] = useState<string[]>([]);
  const options = definition.options ?? [];

  const toggle = (value: string) => {
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const handleApply = () => {
    if (selected.length === 0) return;
    const labels = options.filter((o) => selected.includes(o.value)).map((o) => o.label);
    onApply({
      key: definition.key,
      label: definition.label,
      value: selected,
      displayValue: labels.join(', '),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <Label key={opt.value} className="flex items-center gap-2 text-xs">
          <Checkbox checked={selected.includes(opt.value)} onCheckedChange={() => toggle(opt.value)} />
          {opt.label}
        </Label>
      ))}
      <Button size="sm" onClick={handleApply} disabled={selected.length === 0}>
        {t('apply')}
      </Button>
    </div>
  );
}
