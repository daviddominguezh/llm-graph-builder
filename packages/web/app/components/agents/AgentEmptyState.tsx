'use client';

import { useTemplatesPrefetch } from '@/app/hooks/useTemplatesPrefetch';
import { Button } from '@/components/ui/button';
import { Bot, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { CreateAgentWizard } from './CreateAgentWizard';

interface AgentEmptyStateProps {
  orgId: string;
  orgSlug: string;
}

export function AgentEmptyState({ orgId, orgSlug }: AgentEmptyStateProps) {
  const t = useTranslations('agents');
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setCreateOpen(true), 300);
    return () => clearTimeout(id);
  }, []);
  const prefetchedTemplates = useTemplatesPrefetch();

  return (
    <div className="flex w-full h-full items-center justify-center bg-background border-[0.5px] border-t border-b border-r rounded-e-xl">
      <div className="flex w-full max-w-3xl flex-col items-center gap-2 rounded-md border border-dashed bg-background px-4 py-8 text-center">
        <Bot className="size-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('createFirst')}</p>
        <p className="text-xs text-muted-foreground max-w-xs">{t('createFirstDescription')}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" />
          {t('create')}
        </Button>
      </div>
      <CreateAgentWizard
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        orgSlug={orgSlug}
        prefetchedTemplates={prefetchedTemplates}
      />
    </div>
  );
}
