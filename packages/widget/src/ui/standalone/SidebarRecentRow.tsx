import { Star } from 'lucide-react';
import { type MouseEvent, useState } from 'react';

import type { StoredSession } from '../../storage/indexeddb.js';
import { ChatTitleMenu } from './ChatTitleMenu.js';
import { DeleteChatDialog } from './DeleteChatDialog.js';
import { EditableTitle } from './EditableTitle.js';

export interface SidebarRecentRowProps {
  session: StoredSession;
  active: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  onToggleStar: (id: string) => void;
}

interface RowState {
  editing: boolean;
  setEditing: (v: boolean) => void;
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (v: boolean) => void;
}

function useRowState(): RowState {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  return { editing, setEditing, menuOpen, setMenuOpen, deleteDialogOpen, setDeleteDialogOpen };
}

function rowClasses(active: boolean): string {
  const base = 'group relative w-full px-3 py-1.5 text-sm rounded-md flex items-center gap-1.5 min-w-0';
  return active ? `${base} bg-input` : `${base} hover:bg-input`;
}

interface RowTitleProps {
  session: StoredSession;
  editing: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  setEditing: (v: boolean) => void;
}

function RowTitle({ session, editing, onSelect, onRename, setEditing }: RowTitleProps) {
  if (editing) {
    return (
      <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
        <EditableTitle
          title={session.title}
          editing={true}
          onCommit={(newTitle) => onRename(session.sessionId, newTitle)}
          onEditingChange={setEditing}
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(session.sessionId)}
      className="truncate flex-1 min-w-0 text-left bg-transparent outline-none cursor-pointer"
      title={session.title}
    >
      {session.title}
    </button>
  );
}

interface RowEndSlotProps {
  session: StoredSession;
  active: boolean;
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
  setEditing: (v: boolean) => void;
  setDeleteDialogOpen: (v: boolean) => void;
  onToggleStar: (id: string) => void;
}

function dotsButtonClasses(active: boolean, menuOpen: boolean): string {
  const base = 'transition-opacity';
  const visible = active || menuOpen;
  if (visible) return `${base} opacity-100`;
  return `${base} opacity-0 group-hover:opacity-100 focus-visible:opacity-100`;
}

function RowEndSlot({
  session,
  active,
  menuOpen,
  setMenuOpen,
  setEditing,
  setDeleteDialogOpen,
  onToggleStar,
}: RowEndSlotProps) {
  const dotsVisible = menuOpen || active;
  const starred = session.starred === true;
  const showStar = starred && !dotsVisible;

  function handleTriggerClick(e: MouseEvent<HTMLButtonElement>): void {
    e.stopPropagation();
  }

  function handleSlotClick(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  return (
    <div className="shrink-0 relative size-6 flex items-center justify-center" onClick={handleSlotClick}>
      {showStar && (
        <Star className="size-3 fill-current text-muted-foreground pointer-events-none absolute group-hover:opacity-0" />
      )}
      <ChatTitleMenu
        starred={starred}
        triggerIcon="dots"
        open={menuOpen}
        onOpenChange={setMenuOpen}
        triggerClassName={dotsButtonClasses(active, menuOpen)}
        onTriggerClick={handleTriggerClick}
        onRename={() => setEditing(true)}
        onToggleStar={() => onToggleStar(session.sessionId)}
        onRequestDelete={() => setDeleteDialogOpen(true)}
      />
    </div>
  );
}

export function SidebarRecentRow({
  session,
  active,
  onSelect,
  onRename,
  onDelete,
  onToggleStar,
}: SidebarRecentRowProps) {
  const state = useRowState();

  function handleConfirmDelete(): void {
    onDelete(session.sessionId);
    state.setDeleteDialogOpen(false);
  }

  return (
    <div className={rowClasses(active)} data-active={active ? 'true' : 'false'}>
      <RowTitle
        session={session}
        editing={state.editing}
        onSelect={onSelect}
        onRename={onRename}
        setEditing={state.setEditing}
      />
      <RowEndSlot
        session={session}
        active={active}
        menuOpen={state.menuOpen}
        setMenuOpen={state.setMenuOpen}
        setEditing={state.setEditing}
        setDeleteDialogOpen={state.setDeleteDialogOpen}
        onToggleStar={onToggleStar}
      />
      <DeleteChatDialog
        open={state.deleteDialogOpen}
        onOpenChange={state.setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
