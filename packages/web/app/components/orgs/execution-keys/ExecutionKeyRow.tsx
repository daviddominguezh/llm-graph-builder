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
  return <span className="rounded-full border border-transparent bg-background px-1.5 font-mono text-[10px]">{slug}</span>;
}

function AllAgentsBadge() {
  const t = useTranslations('executionKeys');
  return <span className="rounded-full border border-transparent bg-background px-1.5 font-mono text-[10px]">{t('allBadge')}</span>;
}

function SpecificAgentBadges({ keyData }: { keyData: ExecutionKeyWithAgents }) {
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

function AgentBadges({ keyData }: { keyData: ExecutionKeyWithAgents }) {
  if (keyData.all_agents) return <AllAgentsBadge />;
  return <SpecificAgentBadges keyData={keyData} />;
}

function MaskedKeyPrefix({ prefix }: { prefix: string }) {
  const visible = prefix.slice(0, 7);

  return <span className="text-muted-foreground font-mono text-[10px]">{`${visible}...`}</span>;
}

function KeyIdentity({ keyData }: { keyData: ExecutionKeyWithAgents }) {
  const t = useTranslations('executionKeys');
  const expired = isExpired(keyData.expires_at);

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="bg-background rounded-full p-1.5 border border-transparent shrink-0">
        <Braces className="size-4.5" />
      </div>
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium font-mono truncate">{keyData.name.toUpperCase()}</span>
          {expired && <Badge variant="destructive">{t('expired')}</Badge>}
        </div>
        <MaskedKeyPrefix prefix={keyData.key_prefix} />
      </div>
    </div>
  );
}

export function ExecutionKeyRow({ keyData, onDelete }: ExecutionKeyRowProps) {
  const t = useTranslations('executionKeys');
  const locale = useLocale();

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 rounded-md border border-transparent px-3 py-2 bg-card transition-colors">
      <KeyIdentity keyData={keyData} />
      <AgentBadges keyData={keyData} />
      <span className="text-muted-foreground text-[11px] whitespace-nowrap">
        {t('created')} {formatRelativeTime(keyData.created_at, locale)}
      </span>
      <span className="text-muted-foreground text-[11px] whitespace-nowrap">
        {keyData.expires_at !== null
          ? `${t('expiresAt')} ${formatRelativeDate(keyData.expires_at)}`
          : t('noExpiration')}
      </span>
      <Button
        variant="destructive"
        className="shrink-0 aspect-square p-0 h-7"
        size="icon"
        onClick={() => onDelete(keyData.id, keyData.name)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
