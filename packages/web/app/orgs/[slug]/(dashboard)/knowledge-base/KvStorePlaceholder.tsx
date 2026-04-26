'use client';

import { Database } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function KvStorePlaceholder(): React.JSX.Element {
  const t = useTranslations('knowledgeBase');
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-background px-4 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
        <Database className="size-5 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium">{t('kvComingSoon')}</p>
    </div>
  );
}
