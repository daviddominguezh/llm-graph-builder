'use client';

import { Scrollable } from '@/app/components/Scrollable';
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
import React from 'react';

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
    <div className="flex items-center justify-between pl-3 pr-1 py-1.5 pb-[calc(0px+var(--spacing)*1.5)] border-b border-b-[0.5px] mb-2.5">
      <h2 className="mt-[1px] font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60 cursor-default">
        {t('title').toUpperCase()}
      </h2>
      <Button
        variant="ghost"
        size="xs"
        className="aspect-square p-0! h-5 rounded-full"
        onClick={onCreateClick}
      >
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
  const t = useTranslations('agents');

  const href = `/orgs/${orgSlug}/editor/${agent.slug}`;
  const status = getAgentStatus(agent);
  const colorClass = STATUS_COLORS[status];

  const agentIsLive: boolean = status === 'published' || agent.version > 0;

  return (
    <Link
      href={href}
      className={`group flex gap-2 rounded-md pr-2 py-0 ${
        active ? 'bg-input/70 text-foreground' : 'hover:bg-input/70 text-foreground'
      }`}
    >
      <StatusBar active={active} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <span className="w-full flex items-center gap-1 justify-between">
          <div className="flex items-center gap-1 shrink-0 flex-1 min-w-[0px]">
            <span className={`shrink-0 size-[7px] ml-[2px] shrink-0 rounded-full ${colorClass}`} />
            <span className="shrink-0 flex-1 min-w-[0px] truncate text-[10px] font-medium">{agent.name}</span>
          </div>
          <div
            className={`w-[54px] rounded-[4px] shrink-0 flex justify-center items-center ml-[2px] gap-1 text-[9px] text-white ${agentIsLive ? 'bg-red-700 dark:bg-red-500' : 'bg-black/40 dark:bg-white/30'}`}
          >
            <span className="uppercase font-mono font-semibold">
              {agentIsLive ? t('isLive') : t('isNotLive')}
            </span>
            <span className="font-bold">·</span>
            <span className="font-mono font-semibold">v{agent.version}</span>
          </div>
        </span>
        {agent.description ? (
          <div className="flex justify-between items-center text-[10px] text-muted-foreground">
            <span className="shrink-0 line-clamp-2 flex-1 min-w-[0px] truncate">{agent.description}</span>
            <span className="shrink-0 text-foreground/85" suppressHydrationWarning>
              <span className='whitespace-pre-wrap'>{' '}</span>
              {t('edited')} {formatRelativeTime(agent.updated_at, 'en', 'compact')} {t('ago')}
            </span>
          </div>
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
      <p className="px-3 py-4 text-center text-xs text-muted-foreground bg-input/70 mt-1 mx-3 rounded-md">
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
    <nav className="flex flex-col gap-2.5 px-2 mt-1">
      {filtered.map((agent) => (
        <React.Fragment key={agent.id}>
          <AgentCard
            agent={agent}
            orgSlug={orgSlug}
            active={pathname === `/orgs/${orgSlug}/editor/${agent.slug}`}
          />
        </React.Fragment>
      ))}
    </nav>
  );
}

function deriveIsAgentEditor(pathname: string, orgSlug: string, agents: AgentMetadata[]): boolean {
  const prefix = `/orgs/${orgSlug}/editor/`;
  if (!pathname.startsWith(prefix)) return false;
  const slug = pathname.slice(prefix.length).split('/')[0];
  return agents.some((a) => a.slug === slug && a.app_type === 'agent');
}

export function AgentsSidebar({ agents: serverAgents, orgId, orgSlug }: AgentsSidebarProps) {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { collapsed, agents: contextAgents, syncAgents } = useAgentsSidebar();
  const prefetchedTemplates = useTemplatesPrefetch();
  const agents = contextAgents.length > 0 ? contextAgents : serverAgents;

  useEffect(() => syncAgents(serverAgents), [serverAgents, syncAgents]);

  const isAgentEditor = deriveIsAgentEditor(pathname, orgSlug, agents);

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
    <div
      className={`relative flex h-full w-[240px] shrink-0 mt-[0.5px] ${isAgentEditor ? 'bg-card' : 'mb-[0.5px]'} `}
    >
      <GlassPanel
        className={`absolute w-full h-[calc(100%-1px)] flex-col pointer-events-auto rounded-s-xl ${isAgentEditor ? 'rounded-ee-xl' : ''}`}
      >
        <SidebarHeader onCreateClick={() => setCreateOpen(true)} />
        <SearchInput value={search} onChange={setSearch} />
        <Scrollable className="flex-1">
          <AgentList agents={agents} orgSlug={orgSlug} pathname={pathname} search={search} />
        </Scrollable>
        <CreateAgentWizard
          open={createOpen}
          onOpenChange={setCreateOpen}
          orgId={orgId}
          orgSlug={orgSlug}
          prefetchedTemplates={prefetchedTemplates}
        />
      </GlassPanel>
    </div>
  );
}
