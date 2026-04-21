import type { StoredSession } from '../../storage/indexeddb.js';
import { SidebarRecentRow } from './SidebarRecentRow.js';

export interface SidebarRecentsProps {
  sessions: StoredSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  onToggleStar: (id: string) => void;
}

export function SidebarRecents({
  sessions,
  activeId,
  onSelect,
  onRename,
  onDelete,
  onToggleStar,
}: SidebarRecentsProps) {
  return (
    <div className="flex flex-col gap-0.5 px-2 pb-3 overflow-y-auto flex-1">
      {sessions.map((s) => (
        <SidebarRecentRow
          key={s.sessionId}
          session={s}
          active={s.sessionId === activeId}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
          onToggleStar={onToggleStar}
        />
      ))}
    </div>
  );
}
