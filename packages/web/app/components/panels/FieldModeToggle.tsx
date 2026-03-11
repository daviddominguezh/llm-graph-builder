'use client';

import { Button } from '@/components/ui/button';
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
    <div className="flex gap-1">
      {MODES.map((m) => (
        <Button
          key={m}
          variant={mode === m ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onModeChange(m)}
          className="h-5 px-1.5 text-[9px] font-medium"
        >
          {getModeLabel(m, t)}
        </Button>
      ))}
    </div>
  );
}
