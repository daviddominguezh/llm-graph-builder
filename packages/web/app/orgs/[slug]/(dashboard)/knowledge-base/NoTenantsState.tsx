'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight, Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface NoTenantsStateProps {
  orgSlug: string;
}

export function NoTenantsState({ orgSlug }: NoTenantsStateProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase');
  return (
    <div className="flex w-full max-w-4xl flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <Building2 className="size-5 text-muted-foreground" strokeWidth={1.5} />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t('noTenantsTitle')}</span>
        <span className="text-xs text-muted-foreground">{t('noTenantsDescription')}</span>
      </div>
      <Button
        variant="default"
        size="sm"
        className="gap-1.5"
        render={<Link href={`/orgs/${orgSlug}/tenants`} />}
      >
        {t('goToTenants')}
        <ArrowRight className="size-3.5" />
      </Button>
    </div>
  );
}
