'use client';

import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function ChannelsEmptyState() {
  const t = useTranslations('editor.channels');

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
        <Building2 className="size-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t('noTenants')}</p>
        <p className="max-w-xs text-xs text-muted-foreground">{t('noTenantsDescription')}</p>
      </div>
    </div>
  );
}
