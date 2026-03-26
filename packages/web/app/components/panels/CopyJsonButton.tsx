'use client';

import { useCallback, useState } from 'react';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

const FEEDBACK_DURATION = 1500;

interface CopyJsonButtonProps {
  getValue: () => string;
}

export function CopyJsonButton({ getValue }: CopyJsonButtonProps) {
  const t = useTranslations('common');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(getValue());
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, FEEDBACK_DURATION);
  }, [getValue]);

  const Icon = copied ? Check : Copy;
  const label = copied ? t('copied') : t('copyJson');

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="absolute right-1.5 top-1.5 z-10 text-muted-foreground hover:text-foreground"
      onClick={handleCopy}
      aria-label={label}
      title={label}
    >
      <Icon className="size-3.5" />
    </Button>
  );
}
