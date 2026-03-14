'use client';

import type { AgentMetadata } from '@/app/lib/agents';
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

function AgentListItem({ agent, orgSlug, active }: { agent: AgentMetadata; orgSlug: string; active: boolean }) {
  const href = `/orgs/${orgSlug}/editor/${agent.slug}`;

  return (
    <Link
      href={href}
      className={`flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
        active ? 'bg-black/[0.04] font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <span className="truncate">{agent.name}</span>
    </Link>
  );
}

function AgentList({ agents, orgSlug, pathname }: { agents: AgentMetadata[]; orgSlug: string; pathname: string }) {
  const t = useTranslations('agents');

  if (agents.length === 0) {
    return <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <nav className="flex flex-col gap-0.5 px-0">
      {agents.map((agent) => (
        <AgentListItem
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
    <aside className="flex h-full w-[270px] shrink-0 flex-col border-r bg-background pr-2">
      <SidebarHeader onCreateClick={() => setCreateOpen(true)} />
      <div className="flex-1 overflow-y-auto py-1">
        <AgentList agents={agents} orgSlug={orgSlug} pathname={pathname} />
      </div>
      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} orgId={orgId} orgSlug={orgSlug} />
    </aside>
  );
}
