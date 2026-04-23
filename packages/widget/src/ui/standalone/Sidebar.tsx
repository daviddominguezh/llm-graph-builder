import { PanelLeft, Plus } from 'lucide-react';

import { useT } from '../../app/i18nContext.js';
import type { StoredSession } from '../../storage/indexeddb.js';
import { Button } from '../primitives/button.js';
import { SidebarSessionGroup } from './SidebarRecents.js';
import { ThemeToggle } from './ThemeToggle.js';

export interface SidebarProps {
  sessions: StoredSession[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onDeleteSession: (id: string) => void;
  onToggleStarSession: (id: string) => void;
  onCollapse?: () => void;
}

interface HeaderProps {
  onNewChat: () => void;
  newChatLabel: string;
  onCollapse?: () => void;
  collapseLabel: string;
}

function SidebarHeader({ onNewChat, newChatLabel, onCollapse, collapseLabel }: HeaderProps) {
  return (
    <div className="h-12 px-2 flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onNewChat}
        className="flex-1 h-8 px-3 flex items-center gap-2 text-sm rounded-md hover:bg-card dark:hover:bg-input cursor-pointer transition-colors"
      >
        <Plus className="size-4" />
        <span>{newChatLabel}</span>
      </button>
      <Button variant="ghost" size="icon" aria-label={collapseLabel} onClick={onCollapse}>
        <PanelLeft />
      </Button>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="shrink-0 p-2 flex items-center justify-end">
      <ThemeToggle />
    </div>
  );
}

export function Sidebar({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onToggleStarSession,
  onCollapse,
}: SidebarProps) {
  const t = useT();
  const starred = sessions.filter((s) => s.starred === true);
  const recents = sessions.filter((s) => s.starred !== true);

  return (
    <aside className="bg-background dark:bg-sidebar text-sidebar-foreground flex flex-col w-full h-dvh min-h-0">
      <SidebarHeader
        onNewChat={onNewChat}
        newChatLabel={t('newChat')}
        onCollapse={onCollapse}
        collapseLabel={t('collapseSidebar')}
      />
      <div className="flex-1 overflow-y-auto px-2 pb-3 flex flex-col gap-2">
        <SidebarSessionGroup
          label={t('starredSection')}
          sessions={starred}
          activeId={activeSessionId}
          onSelect={onSelectSession}
          onRename={onRenameSession}
          onDelete={onDeleteSession}
          onToggleStar={onToggleStarSession}
        />
        <SidebarSessionGroup
          label={t('recents')}
          sessions={recents}
          activeId={activeSessionId}
          onSelect={onSelectSession}
          onRename={onRenameSession}
          onDelete={onDeleteSession}
          onToggleStar={onToggleStarSession}
        />
      </div>
      <SidebarFooter />
    </aside>
  );
}
