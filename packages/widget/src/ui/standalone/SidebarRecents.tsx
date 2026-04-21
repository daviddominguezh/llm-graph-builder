import { Star } from 'lucide-react';

import type { StoredSession } from '../../storage/indexeddb.js';

export interface SidebarRecentsProps {
  sessions: StoredSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

function rowClasses(active: boolean): string {
  const base = 'w-full text-left px-3 py-1.5 text-sm rounded-md cursor-pointer flex items-center gap-1.5';
  return active ? `${base} bg-sidebar-accent` : `${base} hover:bg-sidebar-accent`;
}

function RecentRow({
  session,
  active,
  onSelect,
}: {
  session: StoredSession;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(session.sessionId)}
      className={rowClasses(active)}
      title={session.title}
    >
      <span className="truncate flex-1 min-w-0">{session.title}</span>
      {session.starred === true && <Star className="size-3 fill-current text-muted-foreground shrink-0" />}
    </button>
  );
}

export function SidebarRecents({ sessions, activeId, onSelect }: SidebarRecentsProps) {
  return (
    <div className="flex flex-col gap-0.5 px-2 pb-3 overflow-y-auto flex-1">
      {sessions.map((s) => (
        <RecentRow key={s.sessionId} session={s} active={s.sessionId === activeId} onSelect={onSelect} />
      ))}
    </div>
  );
}
