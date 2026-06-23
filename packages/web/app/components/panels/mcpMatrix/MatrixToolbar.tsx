'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface MatrixToolbarProps {
  onVerifyAll: () => void;
}

/**
 * Sub-header toolbar row. The "Verify all" action lives here, in its own row
 * below the DialogHeader, so it never overlaps the dialog's close (X) button.
 */
export function MatrixToolbar({ onVerifyAll }: MatrixToolbarProps) {
  const t = useTranslations('mcpMatrix');
  return (
    <div className="flex items-center justify-between border-b pb-2">
      <p className="text-xs text-muted-foreground">{t('definitionHelp')}</p>
      <Button variant="outline" size="xs" className="gap-1.5" onClick={onVerifyAll}>
        <RefreshCw className="size-3" />
        {t('verifyAll')}
      </Button>
    </div>
  );
}
