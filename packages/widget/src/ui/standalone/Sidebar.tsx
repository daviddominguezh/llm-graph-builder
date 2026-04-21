import { PanelLeft, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useT } from '../../app/i18nContext.js';
import type { StoredSession } from '../../storage/indexeddb.js';
import { Button } from '../primitives/button.js';
import { SidebarRecents } from './SidebarRecents.js';

export interface SidebarProps {
  sessions: StoredSession[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onCollapse?: () => void;
}

function useFilteredSessions(sessions: StoredSession[], query: string): StoredSession[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, query]);
}

function SidebarHeader({ onCollapse, collapseLabel }: { onCollapse?: () => void; collapseLabel: string }) {
  return (
    <div className="h-12 px-2 flex items-center justify-end shrink-0">
      <Button variant="ghost" size="icon" aria-label={collapseLabel} onClick={onCollapse}>
        <PanelLeft />
      </Button>
    </div>
  );
}

function SidebarNewChat({ onNewChat, label }: { onNewChat: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onNewChat}
      className="mx-2 px-3 py-1.5 flex items-center gap-2 text-sm rounded-md hover:bg-sidebar-accent cursor-pointer"
    >
      <Plus className="size-4" />
      <span>{label}</span>
    </button>
  );
}

function SidebarSearch({
  query,
  onChange,
  placeholder,
  label,
}: {
  query: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="mx-2 px-3 py-1.5 flex items-center gap-2 text-sm rounded-md hover:bg-sidebar-accent">
      <Search className="size-4 text-muted-foreground" />
      <input
        type="text"
        aria-label={label}
        placeholder={placeholder}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none w-full placeholder:text-muted-foreground"
      />
    </div>
  );
}

export function Sidebar({ sessions, activeSessionId, onNewChat, onSelectSession, onCollapse }: SidebarProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const filtered = useFilteredSessions(sessions, query);

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border h-dvh min-h-0">
      <SidebarHeader onCollapse={onCollapse} collapseLabel={t('collapseSidebar')} />
      <div className="flex flex-col gap-0.5 pb-2">
        <SidebarNewChat onNewChat={onNewChat} label={t('newChat')} />
        <SidebarSearch query={query} onChange={setQuery} placeholder={t('search')} label={t('search')} />
      </div>
      <div className="text-xs text-muted-foreground px-3 py-2">{t('recents')}</div>
      <SidebarRecents sessions={filtered} activeId={activeSessionId} onSelect={onSelectSession} />
    </aside>
  );
}
