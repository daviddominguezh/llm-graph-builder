'use client';

import type { ExecutionKeyWithAgents } from '@/app/lib/executionKeys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Braces, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React from 'react';

interface ExecutionKeyRowProps {
  keyData: ExecutionKeyWithAgents;
  onDelete: (id: string, name: string) => void;
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isExpired(expiresAt: string | null): boolean {
  if (expiresAt === null) return false;
  return new Date(expiresAt) < new Date();
}

function AgentBadges({ keyData }: { keyData: ExecutionKeyWithAgents }) {
  if (keyData.agents.length === 0) return null;

  return (
    <div className="flex gap-1">
      {keyData.agents.map((agent, i) => (
        <React.Fragment key={agent.agent_id}>
          <span className="font-mono text-[10px]">{agent.agent_slug}</span>
          {i < keyData.agents.length - 1 && <Separator orientation="vertical" />}
        </React.Fragment>
      ))}
    </div>
  );
}

function KeyMetadata({ keyData }: { keyData: ExecutionKeyWithAgents }) {
  const t = useTranslations('executionKeys');
  const lastUsed = keyData.last_used_at !== null ? formatRelativeDate(keyData.last_used_at) : t('never');

  return (
    <div className="text-muted-foreground flex flex-1 text-xs justify-evenly">
      <span>
        <span className="font-mono">{keyData.key_prefix}</span>
      </span>
      <span>
        {t('created')}: {formatRelativeDate(keyData.created_at)}
      </span>
      <span>
        {t('lastUsed')}: {lastUsed}
      </span>
    </div>
  );
}

export function ExecutionKeyRow({ keyData, onDelete }: ExecutionKeyRowProps) {
  const expired = isExpired(keyData.expires_at);
  const t = useTranslations('executionKeys');

  return (
    <div className="flex w-full items-center justify-between items-center gap-3 rounded-md border px-3 py-2 bg-card">
      <div className="flex gap-3 items-center flex-1">
        <div className="bg-background rounded-full p-1.5 border">
          <Braces className="size-4" />
        </div>
        <div className="flex min-w-0 flex-1 flex-row gap-1.5 items-center">
          <div className="flex flex-col shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium font-mono">{keyData.name.toUpperCase()}</span>
              {expired && <Badge variant="destructive">{t('expired')}</Badge>}
            </div>
            <AgentBadges keyData={keyData} />
          </div>
          <KeyMetadata keyData={keyData} />
        </div>
      </div>
      <Button
        variant="destructive"
        className="shrink-0"
        size="icon-sm"
        onClick={() => onDelete(keyData.id, keyData.name)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
