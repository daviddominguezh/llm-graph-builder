'use client';

import { useTemplatesPrefetch } from '@/app/hooks/useTemplatesPrefetch';
import type { AgentMetadata } from '@/app/lib/agents';
import { formatRelativeTime } from '@/app/utils/formatRelativeTime';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Input } from '@/components/ui/input';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAgentsSidebar } from './AgentsSidebarContext';
import { CreateAgentWizard } from './CreateAgentWizard';
import { STATUS_COLORS, getAgentStatus } from './agentStatus';

interface AgentsSidebarProps {
  agents: AgentMetadata[];
  orgId: string;
  orgSlug: string;
}

function SidebarHeader({ onCreateClick }: { onCreateClick: () => void }) {
  const t = useTranslations('agents');

  return (
    <div className="flex items-center justify-between pl-3 pr-1 py-1.5 border-b mb-2.5">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <Button variant="ghost" size="icon" onClick={onCreateClick}>
        <Plus />
      </Button>
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations('agents');

  return (
    <div className="px-2 pb-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('search')}
          className="pl-7"
        />
      </div>
    </div>
  );
}

function StatusBar({ active }: { active: boolean }) {
  return (
    <div
      className={`w-0.5 my-2 shrink-0 self-stretch ${active ? 'bg-transparent' : 'bg-transparent group-hover:bg-transparent'}`}
    />
  );
}

function AgentCard({ agent, orgSlug, active }: { agent: AgentMetadata; orgSlug: string; active: boolean }) {
  const href = `/orgs/${orgSlug}/editor/${agent.slug}`;
  const status = getAgentStatus(agent);
  const colorClass = STATUS_COLORS[status];

  return (
    <Link
      href={href}
      className={`group flex gap-2 rounded-md pr-2 py-0 ${
        active ? 'bg-input dark:bg-input/70 text-foreground' : 'hover:bg-input dark:hover:bg-input/20 text-foreground'
      }`}
    >
      <StatusBar active={active} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <span className="flex items-center gap-1">
          <span className={`shrink-0 size-[7px] ml-[2px] shrink-0 rounded-full ${colorClass}`} />
          <span className="shrink-0 flex-1 min-w-[0px] truncate text-[10px] font-medium font-mono">{agent.name}</span>
          <div className="w-[40px] shrink-0 flex items-center ml-[2px] gap-1 text-[9px] text-muted-foreground">
            <span>v{agent.version}</span>
            <span>·</span>
            <span suppressHydrationWarning>{formatRelativeTime(agent.updated_at, 'en', 'compact')}</span>
          </div>
        </span>
        {agent.description ? (
          <span className="line-clamp-1 ml-[2px] text-[10px] text-muted-foreground">{agent.description}</span>
        ) : null}
      </div>
    </Link>
  );
}

function AgentList({
  agents,
  orgSlug,
  pathname,
  search,
}: {
  agents: AgentMetadata[];
  orgSlug: string;
  pathname: string;
  search: string;
}) {
  const t = useTranslations('agents');
  const filtered = agents.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  if (agents.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-xs text-muted-foreground bg-input/20 dark:bg-input/30 mt-1 mx-3 rounded-md">
        {t('empty')}
      </p>
    );
  }

  if (filtered.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-xs text-muted-foreground bg-muted mt-1 mx-3 rounded-md">
        {t('noResults')}
      </p>
    );
  }

  return (
    <nav className="flex flex-col gap-1.5 px-2 mt-1">
      {filtered.map((agent) => (
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

export function AgentsSidebar({ agents: serverAgents, orgId, orgSlug }: AgentsSidebarProps) {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { collapsed, agents: contextAgents, syncAgents } = useAgentsSidebar();
  const prefetchedTemplates = useTemplatesPrefetch();
  const agents = contextAgents.length > 0 ? contextAgents : serverAgents;

  useEffect(() => syncAgents(serverAgents), [serverAgents, syncAgents]);

  if (collapsed) {
    return (
      <CreateAgentWizard
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        orgSlug={orgSlug}
        prefetchedTemplates={prefetchedTemplates}
      />
    );
  }

  return (
    <GlassPanel variant="background" className="relative flex h-[calc(100%-var(--spacing)*2-1px)] w-[240px] shrink-0 flex-col pointer-events-auto rounded-xl mt-[1px]">
      <SidebarHeader onCreateClick={() => setCreateOpen(true)} />
      <SearchInput value={search} onChange={setSearch} />
      <div className="flex-1 overflow-y-auto">
        <AgentList agents={agents} orgSlug={orgSlug} pathname={pathname} search={search} />
      </div>
      <CreateAgentWizard
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        orgSlug={orgSlug}
        prefetchedTemplates={prefetchedTemplates}
      />
    </GlassPanel>
  );
}
