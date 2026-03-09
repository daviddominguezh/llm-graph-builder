'use client';

import type { AgentMetadata } from '@/app/lib/agents';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AgentTable } from './AgentTable';
import { CreateAgentDialog } from './CreateAgentDialog';
import { EmptyState } from './EmptyState';

interface AgentDashboardProps {
  agents: AgentMetadata[];
  orgId: string;
  orgSlug: string;
}

function DashboardHeader({ onCreateClick }: { onCreateClick: () => void }) {
  const t = useTranslations('agents');

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

export function AgentDashboard({ agents, orgId, orgSlug }: AgentDashboardProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const hasAgents = agents.length > 0;

  return (
    <div className="flex w-full flex-col gap-6">
      <DashboardHeader onCreateClick={() => setCreateOpen(true)} />
      {hasAgents ? <AgentTable agents={agents} orgSlug={orgSlug} /> : <EmptyState />}
      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} orgId={orgId} orgSlug={orgSlug} />
    </div>
  );
}
