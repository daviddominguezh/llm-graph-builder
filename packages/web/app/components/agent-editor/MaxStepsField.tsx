'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Info } from 'lucide-react';
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
      <Label htmlFor="max-steps" className="text-xs font-medium mb-1">
        {t('maxSteps')}
      </Label>
      <div className="flex items-center pl-4 border-l-2 border-accent/20 py-1">
        <Input
          id="max-steps"
          type="number"
          defaultValue={value ?? ''}
          onChange={handleChange}
          placeholder={t('maxStepsPlaceholder')}
          className="w-32 shrink-0"
        />
        <div className="flex-1 py-0.5 items-center">
          <p className="cursor-default h-full items-center flex text-[11px] text-muted-foreground ml-2 p-1 px-1.5 gap-1.5">
            <Info className='size-3.5' />
            {t('maxStepsDescription')}
          </p>
        </div>
      </div>
    </div>
  );
}
