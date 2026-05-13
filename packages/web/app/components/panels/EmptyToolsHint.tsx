'use client';

import { useTranslations } from 'next-intl';

export function EmptyToolsHint(): React.JSX.Element {
  const t = useTranslations('agentTools');
  return (
    <p className="text-muted-foreground text-xs bg-muted py-2 px-3 mx-1 mt-2 rounded-md">
      {t('noToolsHint')}
    </p>
  );
}
