'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';

const DEBOUNCE_MS = 500;

interface MaxStepsFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

function parseMaxSteps(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function MaxStepsField({ value, onChange }: MaxStepsFieldProps) {
  const t = useTranslations('agentEditor');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onChange(parseMaxSteps(raw));
      }, DEBOUNCE_MS);
    },
    [onChange]
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{t('maxSteps')}</Label>
      <Input
        type="number"
        defaultValue={value ?? ''}
        onChange={handleChange}
        placeholder={t('maxStepsPlaceholder')}
        className="w-32"
      />
      <p className="text-[11px] text-muted-foreground">{t('maxStepsDescription')}</p>
    </div>
  );
}
