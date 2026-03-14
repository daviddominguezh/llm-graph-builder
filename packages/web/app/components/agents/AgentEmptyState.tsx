'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { CreateAgentDialog } from './CreateAgentDialog';

interface AgentEmptyStateProps {
  orgId: string;
  orgSlug: string;
}

function NodeIllustration() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-muted-foreground/40"
    >
      <rect
        x="12"
        y="12"
        width="56"
        height="56"
        rx="12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="6 4"
      />
      <line x1="40" y1="30" x2="40" y2="50" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
      <line x1="30" y1="40" x2="50" y2="40" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
    </svg>
  );
}

export function AgentEmptyState({ orgId, orgSlug }: AgentEmptyStateProps) {
  const t = useTranslations('agents');
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <NodeIllustration />
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-lg font-medium text-foreground">{t('createFirst')}</h2>
        <p className="max-w-xs text-center text-sm text-muted-foreground">{t('createFirstDescription')}</p>
      </div>
      <Button onClick={() => setCreateOpen(true)}>
        <Plus data-icon="inline-start" />
        {t('create')}
      </Button>
      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} orgId={orgId} orgSlug={orgSlug} />
    </div>
  );
}
