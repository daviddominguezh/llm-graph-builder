'use client';

import type { ExecutionKeyWithAgents } from '@/app/lib/execution-keys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
  const t = useTranslations('executionKeys');
  const [expanded, setExpanded] = useState(false);
  const count = keyData.agents.length;

  if (count === 0) return null;

  if (!expanded) {
    return (
      <Badge variant="secondary" className="cursor-pointer" onClick={() => setExpanded(true)}>
        {t('agentCount', { count })}
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {keyData.agents.map((agent) => (
        <Badge key={agent.agent_id} variant="secondary">
          {agent.agent_name}
        </Badge>
      ))}
    </div>
  );
}

function KeyMetadata({ keyData }: { keyData: ExecutionKeyWithAgents }) {
  const t = useTranslations('executionKeys');
  const lastUsed = keyData.last_used_at !== null ? formatRelativeDate(keyData.last_used_at) : t('never');

  return (
    <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
      <span>
        {t('prefix')}: <span className="font-mono">{keyData.key_prefix}</span>
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
    <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{keyData.name}</span>
          {expired && <Badge variant="destructive">{t('expired')}</Badge>}
        </div>
        <KeyMetadata keyData={keyData} />
        <AgentBadges keyData={keyData} />
      </div>
      <Button variant="ghost" size="icon-sm" onClick={() => onDelete(keyData.id, keyData.name)}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
