'use client';

import { useTranslations } from 'next-intl';

import { DateTimePicker } from './DateTimePicker';

interface OnceFieldProps {
  value: string;
  onChange: (value: string) => void;
}

const SENTENCE_BASE = 'flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm leading-relaxed';

export function OnceField({ value, onChange }: OnceFieldProps) {
  const t = useTranslations('editor.triggers');
  return (
    <div className={SENTENCE_BASE}>
      <span className="text-muted-foreground">{t('runOn')}</span>
      <DateTimePicker value={value} onChange={onChange} />
    </div>
  );
}
