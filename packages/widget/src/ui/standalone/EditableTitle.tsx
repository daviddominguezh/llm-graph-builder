import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

export interface EditableTitleProps {
  title: string;
  editing: boolean;
  onCommit: (newTitle: string) => void;
  onEditingChange: (v: boolean) => void;
  maxWidth?: string;
}

function commitIfChanged(
  draft: string,
  title: string,
  onCommit: (v: string) => void,
  onEditingChange: (v: boolean) => void
): void {
  const trimmed = draft.trim();
  if (trimmed.length > 0 && trimmed !== title) onCommit(trimmed);
  onEditingChange(false);
}

interface InputProps {
  title: string;
  onCommit: (newTitle: string) => void;
  onEditingChange: (v: boolean) => void;
}

function TitleInput({ title, onCommit, onEditingChange }: InputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    const el = inputRef.current;
    if (el === null) return;
    el.focus();
    el.select();
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') commitIfChanged(draft, title, onCommit, onEditingChange);
    else if (e.key === 'Escape') onEditingChange(false);
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commitIfChanged(draft, title, onCommit, onEditingChange)}
      onKeyDown={onKeyDown}
      className="text-sm font-medium bg-background border border-ring rounded-md px-2 py-0.5 outline-none w-48 max-w-full"
    />
  );
}

export function EditableTitle({ title, editing, onCommit, onEditingChange, maxWidth }: EditableTitleProps) {
  if (editing) {
    return <TitleInput title={title} onCommit={onCommit} onEditingChange={onEditingChange} />;
  }
  return (
    <button
      type="button"
      onClick={() => onEditingChange(true)}
      className="text-sm font-medium truncate cursor-pointer hover:text-foreground text-foreground text-left px-2 py-0.5 rounded-md block"
      style={maxWidth === undefined ? undefined : { maxWidth }}
      title={title}
    >
      {title}
    </button>
  );
}
