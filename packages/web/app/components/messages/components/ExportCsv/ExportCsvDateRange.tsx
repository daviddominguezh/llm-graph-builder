'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MAX_DAYS = 15;
const MS_PER_DAY = 86_400_000;

interface Value {
  from: string;
  to: string;
}

interface Props {
  value: Value;
  onChange: (next: Value) => void;
}

export function ExportCsvDateRange({ value, onChange }: Props): ReactElement {
  const t = useTranslations('forms.export.dateRange');
  const today = new Date().toISOString().slice(0, 10);
  const minFrom = computeMinFrom(today);
  const delta = (Date.parse(value.to) - Date.parse(value.from)) / MS_PER_DAY;
  const invalid = delta < 0 || delta > MAX_DAYS;

  return (
    <div className="flex flex-col gap-1">
      <Label>{t('label')}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={value.from}
          min={minFrom}
          max={today}
          onChange={(e): void => onChange({ ...value, from: e.target.value })}
        />
        <Input
          type="date"
          value={value.to}
          min={value.from}
          max={today}
          onChange={(e): void => onChange({ ...value, to: e.target.value })}
        />
      </div>
      {invalid && <p className="text-xs text-destructive">{t('max15Days')}</p>}
      <p className="text-xs text-muted-foreground">{t('tooltip')}</p>
    </div>
  );
}

function computeMinFrom(today: string): string {
  const todayMs = Date.parse(today);
  const minFromMs = todayMs - MAX_DAYS * MS_PER_DAY * 365;
  return new Date(minFromMs).toISOString().slice(0, 10);
}
