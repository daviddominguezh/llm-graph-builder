'use client';

import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface OrgSettingsHeaderProps {
  slug: string;
}

export function OrgSettingsHeader({ slug }: OrgSettingsHeaderProps) {
  const t = useTranslations('orgs');

  return (
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon-sm" render={<Link href={`/orgs/${slug}`} />} aria-label={t('back')}>
        <ArrowLeft />
      </Button>
      <h1 className="text-lg font-semibold">{t('settingsTitle')}</h1>
    </div>
  );
}
