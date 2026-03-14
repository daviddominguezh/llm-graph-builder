'use client';

import type { AgentMetadata } from '@/app/lib/agents';
import { formatRelativeTime } from '@/app/utils/formatRelativeTime';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { CreateAgentDialog } from './CreateAgentDialog';

interface AgentsSidebarProps {
  agents: AgentMetadata[];
  orgId: string;
  orgSlug: string;
}

function SidebarHeader({ onCreateClick }: { onCreateClick: () => void }) {
  const t = useTranslations('agents');

  return (
    <div className="flex items-center justify-between border-b px-3 py-2">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <Button variant="ghost" size="icon-sm" onClick={onCreateClick}>
        <Plus />
      </Button>
    </div>
  );
}

function AgentCard({ agent, orgSlug, active }: { agent: AgentMetadata; orgSlug: string; active: boolean }) {
  const href = `/orgs/${orgSlug}/editor/${agent.slug}`;

  return (
    <Link
      href={href}
      className={`flex flex-col gap-1 rounded-lg border px-3 py-2 transition-colors ${
        active
          ? 'border-foreground/15 bg-black/[0.04] text-foreground'
          : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
      }`}
    >
      <span className="truncate text-sm font-medium text-foreground">{agent.name}</span>
      {agent.description !== '' && (
        <span className="line-clamp-2 text-xs text-muted-foreground">{agent.description}</span>
      )}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>v{agent.version}</span>
        <span>·</span>
        <span>{formatRelativeTime(agent.updated_at)}</span>
      </div>
    </Link>
  );
}

function AgentList({ agents, orgSlug, pathname }: { agents: AgentMetadata[]; orgSlug: string; pathname: string }) {
  const t = useTranslations('agents');

  if (agents.length === 0) {
    return <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <nav className="flex flex-col gap-1 px-2">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          orgSlug={orgSlug}
          active={pathname === `/orgs/${orgSlug}/editor/${agent.slug}`}
        />
      ))}
    </nav>
  );
}

export function AgentsSidebar({ agents, orgId, orgSlug }: AgentsSidebarProps) {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <aside className="flex h-full w-[270px] shrink-0 flex-col border-r bg-background border rounded-xl">
      <SidebarHeader onCreateClick={() => setCreateOpen(true)} />
      <div className="flex-1 overflow-y-auto py-1">
        <AgentList agents={agents} orgSlug={orgSlug} pathname={pathname} />
      </div>
      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} orgId={orgId} orgSlug={orgSlug} />
    </aside>
  );
}
