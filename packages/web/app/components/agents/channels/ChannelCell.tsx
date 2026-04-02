'use client';

import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export function ChannelCell() {
  const t = useTranslations('editor.channels');

  return (
    <Button variant="outline" size="xs" onClick={() => {}}>
      {t('connect')}
    </Button>
  );
}
