import { useState } from 'react';

import { ChatTitleMenu } from './ChatTitleMenu.js';
import { DeleteChatDialog } from './DeleteChatDialog.js';
import { EditableTitle } from './EditableTitle.js';

export interface ChatHeaderProps {
  title: string;
  starred: boolean;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
  onToggleStar: () => void;
}

export function ChatHeader({ title, starred, onRename, onDelete, onToggleStar }: ChatHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  function handleConfirmDelete(): void {
    onDelete();
    setDeleteDialogOpen(false);
  }

  return (
    <div className="flex items-center gap-1 min-w-0">
      <EditableTitle
        title={title}
        editing={editing}
        onCommit={onRename}
        onEditingChange={setEditing}
        maxWidth="170px"
      />
      {!editing && (
        <ChatTitleMenu
          starred={starred}
          onRename={() => setEditing(true)}
          onToggleStar={onToggleStar}
          onRequestDelete={() => setDeleteDialogOpen(true)}
        />
      )}
      <DeleteChatDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
