'use client';

import { Button } from '@/components/ui/button';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

const FEEDBACK_DURATION = 1500;

export function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const t = useTranslations('common');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), FEEDBACK_DURATION);
  }, [text]);

  const Icon = copied ? Check : Copy;
  const label = copied ? t('copied') : t('copyCurl');

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleCopy}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Icon className="size-3.5" />
    </Button>
  );
}
