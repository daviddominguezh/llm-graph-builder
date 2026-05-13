'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTranslations } from 'next-intl';

export type FieldMode = 'inferred' | 'fixed' | 'reference';

interface FieldModeToggleProps {
  mode: FieldMode;
  onModeChange: (mode: FieldMode) => void;
  readOnly?: boolean;
}

const MODES: FieldMode[] = ['inferred', 'fixed', 'reference'];

function getModeLabel(mode: FieldMode, t: (key: string) => string): string {
  switch (mode) {
    case 'inferred':
      return t('agentInferred');
    case 'fixed':
      return t('fixedValue');
    case 'reference':
      return t('reference');
  }
}

export function FieldModeToggle({ mode, onModeChange, readOnly }: FieldModeToggleProps) {
  const t = useTranslations('edgePanel');
  if (readOnly) return null;

  return (
    <RadioGroup
      value={mode}
      onValueChange={(v) => onModeChange(v as FieldMode)}
      className="flex w-auto flex-row flex-wrap items-center gap-x-3 gap-y-1"
    >
      {MODES.map((m) => (
        <label key={m} className="flex cursor-pointer items-center gap-1.5">
          <RadioGroupItem value={m} className="size-3" />
          <span className="text-[10px] font-medium leading-none">{getModeLabel(m, t)}</span>
        </label>
      ))}
    </RadioGroup>
  );
}
