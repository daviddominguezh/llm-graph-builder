'use client';

import type { ExecutionKeyWithAgents } from '@/app/lib/executionKeys';
import { formatRelativeTime } from '@/app/utils/formatRelativeTime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Braces, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

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

function AgentBadge({ slug }: { slug: string }) {
  return <span className="rounded-full border bg-background px-1.5 font-mono text-[10px]">{slug}</span>;
}

function AgentBadges({ keyData }: { keyData: ExecutionKeyWithAgents }) {
  const t = useTranslations('executionKeys');
  const { agents } = keyData;
  if (agents.length === 0) return null;

  const first = agents[0];
  if (first === undefined) return null;
  const rest = agents.slice(1);

  if (rest.length === 0) {
    return <AgentBadge slug={first.agent_slug} />;
  }

  return (
    <div className="flex items-center gap-1">
      <AgentBadge slug={first.agent_slug} />
      <Separator orientation="vertical" />
      <Tooltip>
        <TooltipTrigger className="rounded-full border bg-background px-1.5 font-mono text-[10px] cursor-default">
          {t('otherAgents', { count: rest.length })}
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-1">
            {rest.map((agent) => (
              <AgentBadge key={agent.agent_id} slug={agent.agent_slug} />
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function MaskedKeyPrefix({ prefix }: { prefix: string }) {
  const visible = prefix.slice(0, 7);

  return <span className="font-mono text-[10px]">{`${visible}${'...'}`}</span>;
}

function KeyMetadata({ keyData }: { keyData: ExecutionKeyWithAgents }) {
  return (
    <div className="text-muted-foreground flex flex-1 text-xs justify-evenly">
      <MaskedKeyPrefix prefix={keyData.key_prefix} />
    </div>
  );
}

export function ExecutionKeyRow({ keyData, onDelete }: ExecutionKeyRowProps) {
  const expired = isExpired(keyData.expires_at);
  const t = useTranslations('executionKeys');
  const locale = useLocale();

  return (
    <div className="flex w-full items-center justify-between items-center gap-3 rounded-md border px-3 py-2 bg-card">
      <div className="flex gap-3 items-center flex-1">
        <div className="flex min-w-0 flex-1 flex-row gap-1.5 items-center justify-between mr-1">
          <div className="bg-background rounded-full p-1.5 border">
            <Braces className="size-4.5" />
          </div>
          <div className="flex flex-col shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium font-mono">{keyData.name.toUpperCase()}</span>
              {expired && <Badge variant="destructive">{t('expired')}</Badge>}
            </div>
            <KeyMetadata keyData={keyData} />
          </div>
          <AgentBadges keyData={keyData} />
          <span className="text-muted-foreground text-[11px]">
            {t('created')} {formatRelativeTime(keyData.created_at, locale)}
          </span>
          <span className="text-muted-foreground text-[11px]">
            {keyData.expires_at !== null
              ? `${t('expiresAt')} ${formatRelativeDate(keyData.expires_at)}`
              : t('noExpiration')}
          </span>
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
