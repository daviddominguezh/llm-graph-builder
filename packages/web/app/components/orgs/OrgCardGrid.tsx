'use client';

import type { OrgWithAgentCount } from '@/app/lib/orgs';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { CreateOrgDialog } from './CreateOrgDialog';
import { EmptyState } from './EmptyState';
import { OrgCard } from './OrgCard';

interface OrgCardGridProps {
  orgs: OrgWithAgentCount[];
}

function GridHeader({ onCreateClick }: { onCreateClick: () => void }) {
  const t = useTranslations('orgs');

  return (
    <div className="flex items-center justify-between">
      <h1 className="text-lg font-semibold">{t('title')}</h1>
      <Button size="lg" onClick={onCreateClick}>
        <Plus data-icon="inline-start" />
        {t('create')}
      </Button>
    </div>
  );
}

function OrgGrid({ orgs }: OrgCardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {orgs.map((org) => (
        <OrgCard key={org.id} org={org} />
      ))}
    </div>
  );
}

export function OrgCardGrid({ orgs }: OrgCardGridProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const hasOrgs = orgs.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <GridHeader onCreateClick={() => setCreateOpen(true)} />
      {hasOrgs ? <OrgGrid orgs={orgs} /> : <EmptyState />}
      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
