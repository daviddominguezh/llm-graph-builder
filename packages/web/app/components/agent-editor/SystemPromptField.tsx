'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';

const DEBOUNCE_MS = 500;

interface SystemPromptFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function SystemPromptField({ value, onChange }: SystemPromptFieldProps) {
  const t = useTranslations('agentEditor');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onChange(text), DEBOUNCE_MS);
    },
    [onChange]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <Label className="text-xs font-medium">{t('systemPrompt')}</Label>
      <Textarea
        defaultValue={value}
        onChange={handleChange}
        placeholder={t('systemPromptPlaceholder')}
        className="min-h-0 flex-1 resize-none text-sm"
      />
    </div>
  );
}
