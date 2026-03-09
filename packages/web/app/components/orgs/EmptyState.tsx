'use client';

import { useTranslations } from 'next-intl';

export function EmptyState() {
  const t = useTranslations('orgs');

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
      <p className="text-muted-foreground text-sm">{t('empty')}</p>
    </div>
  );
}
