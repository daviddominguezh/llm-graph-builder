'use client';

import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface MatrixToolbarProps {
  saving: boolean;
  onVerifyAll: () => void;
}

/**
 * Sub-header toolbar row. The "Verify all" action lives here, in its own row
 * below the DialogHeader, so it never overlaps the dialog's close (X) button.
 */
export function MatrixToolbar({ saving, onVerifyAll }: MatrixToolbarProps) {
  const t = useTranslations('mcpMatrix');
  return (
    <div className="cursor-default flex items-center justify-between">
      {saving ? (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          {t('saving')}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{t('autosaveHint')}</span>
      )}
      <Button variant="ghost" size="xs" className="gap-1.5 text-muted-foreground" onClick={onVerifyAll}>
        <RefreshCw className="size-3" />
        {t('verifyAll')}
      </Button>
    </div>
  );
}
