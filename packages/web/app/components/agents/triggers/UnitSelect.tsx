'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslations } from 'next-intl';

import type { RecurringUnit } from './types';
import { RECURRING_UNITS } from './types';

interface UnitSelectProps {
  value: RecurringUnit;
  onChange: (next: RecurringUnit) => void;
  interval: number;
}

const SINGULAR_INTERVAL = 1;

function unitLabel(t: (key: string) => string, unit: RecurringUnit, plural: boolean): string {
  return t(`units.${unit}.${plural ? 'plural' : 'singular'}`);
}

export function UnitSelect({ value, onChange, interval }: UnitSelectProps) {
  const t = useTranslations('editor.triggers');
  const isPlural = interval !== SINGULAR_INTERVAL;
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as RecurringUnit)}>
      <SelectTrigger className="h-7 text-sm font-medium [&_span]:text-sm">
        <SelectValue>{unitLabel(t, value, isPlural)}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {RECURRING_UNITS.map((u) => (
          <SelectItem key={u} value={u} className="text-sm">
            {unitLabel(t, u, isPlural)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
