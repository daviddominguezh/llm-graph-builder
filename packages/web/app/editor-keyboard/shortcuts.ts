export interface ShortcutContext {
  searchOpen: boolean;
}

export interface ShortcutDef {
  id: string;
  /** react-hotkeys-hook key syntax, e.g. 'mod+z'. */
  keys: string;
  actionId: string;
  description: string;
  /** When true the hotkey stays live inside inputs; default false keeps it inert. */
  enableOnFormTags?: boolean;
  enabled?: (ctx: ShortcutContext) => boolean;
}

/**
 * Declarative editor shortcut table — the single place future shortcuts are
 * added. Each row binds keys to an action id dispatched through the action
 * registry; `description` feeds a future shortcut-help / command palette.
 * Delete / ⌘F / Escape rows land in Task 8 — this ships the undo row only.
 */
export const EDITOR_SHORTCUTS: ShortcutDef[] = [
  { id: 'history.undo', keys: 'mod+z', actionId: 'history.undo', description: 'Undo last change' },
];
