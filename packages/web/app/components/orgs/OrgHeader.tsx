'use client';

import type { OrgRow } from '@/app/lib/orgs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface OrgHeaderProps {
  org: OrgRow;
}

function OrgAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl !== null) {
    return <img src={avatarUrl} alt={name} className="h-10 w-10 rounded-full object-cover" />;
  }

  return (
    <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full text-lg font-medium">
      {initial}
    </div>
  );
}

export function OrgHeader({ org }: OrgHeaderProps) {
  const t = useTranslations('orgs');

  return (
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon-sm" render={<Link href="/" />} aria-label={t('back')}>
        <ArrowLeft />
      </Button>
      <OrgAvatar name={org.name} avatarUrl={org.avatar_url} />
      <h1 className="text-lg font-semibold">{org.name}</h1>
      <Button
        variant="ghost"
        size="icon-sm"
        render={<Link href={`/orgs/${org.slug}/settings`} />}
        aria-label={t('settings')}
      >
        <Settings />
      </Button>
    </div>
  );
}
