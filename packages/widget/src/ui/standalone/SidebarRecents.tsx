import type { StoredSession } from '../../storage/indexeddb.js';
import { SidebarRecentRow } from './SidebarRecentRow.js';

export interface SidebarSessionGroupProps {
  label: string;
  sessions: StoredSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  onToggleStar: (id: string) => void;
}

export function SidebarSessionGroup({
  label,
  sessions,
  activeId,
  onSelect,
  onRename,
  onDelete,
  onToggleStar,
}: SidebarSessionGroupProps) {
  if (sessions.length === 0) return null;
  return (
    <div className="flex flex-col">
      <div className="text-xs text-muted-foreground px-3 pt-2 pb-1">{label}</div>
      <div className="flex flex-col gap-0.5">
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
    </div>
  );
}
