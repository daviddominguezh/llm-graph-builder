import type { StoredSession } from '../../storage/indexeddb.js';

export interface SidebarRecentsProps {
  sessions: StoredSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

function rowClasses(active: boolean): string {
  const base = 'w-full text-left px-3 py-1.5 text-sm truncate rounded-md cursor-pointer';
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
      {session.title}
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
