import { PanelLeft, Plus } from 'lucide-react';

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

function SidebarLogo() {
  return (
    <div className="flex items-center gap-2">
      <img src="/favicon.png" alt="" className="h-6 w-auto" />
      <img src="/logo-black.png" alt="OpenFlow" className="h-4 w-auto dark:hidden" />
      <img src="/logo-white.png" alt="OpenFlow" className="h-4 w-auto hidden dark:block" />
    </div>
  );
}

function SidebarHeader({ onCollapse, collapseLabel }: { onCollapse?: () => void; collapseLabel: string }) {
  return (
    <div className="h-12 px-3 flex items-center justify-between shrink-0">
      <SidebarLogo />
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
      className="mx-2 px-3 py-1.5 flex items-center gap-2 text-sm rounded-md hover:bg-input cursor-pointer"
    >
      <Plus className="size-4" />
      <span>{label}</span>
    </button>
  );
}

export function Sidebar({ sessions, activeSessionId, onNewChat, onSelectSession, onCollapse }: SidebarProps) {
  const t = useT();

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border h-dvh min-h-0">
      <SidebarHeader onCollapse={onCollapse} collapseLabel={t('collapseSidebar')} />
      <div className="flex flex-col gap-0.5 pb-2">
        <SidebarNewChat onNewChat={onNewChat} label={t('newChat')} />
      </div>
      <div className="text-xs text-muted-foreground px-3 py-2">{t('recents')}</div>
      <SidebarRecents sessions={sessions} activeId={activeSessionId} onSelect={onSelectSession} />
    </aside>
  );
}
