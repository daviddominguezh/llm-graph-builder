'use client';

import type { AgentMetadata } from '@/app/lib/agents';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { DeleteAgentDialog } from '../DeleteAgentDialog';

interface DangerZoneProps {
  agentId: string;
  agentName: string;
  agentSlug: string;
}

function buildAgentMetadata(props: DangerZoneProps): AgentMetadata {
  return {
    id: props.agentId,
    name: props.agentName,
    slug: props.agentSlug,
    description: '',
    version: 0,
    updated_at: '',
    published_at: null,
  };
}

export function DangerZone({ agentId, agentName, agentSlug }: DangerZoneProps) {
  const t = useTranslations('settings');
  const [deleteAgent, setDeleteAgent] = useState<AgentMetadata | null>(null);

  function handleDelete() {
    setDeleteAgent(buildAgentMetadata({ agentId, agentName, agentSlug }));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-destructive">{t('dangerZone')}</Label>
      <p className="text-muted-foreground text-xs">{t('deleteAgentDescription')}</p>
      <Button variant="destructive" size="sm" onClick={handleDelete} className="self-start">
        {t('deleteAgent')}
      </Button>
      <DeleteAgentDialog agent={deleteAgent} onOpenChange={() => setDeleteAgent(null)} />
    </div>
  );
}
