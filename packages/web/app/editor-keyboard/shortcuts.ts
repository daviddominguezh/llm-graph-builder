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
 */
export const EDITOR_SHORTCUTS: ShortcutDef[] = [
  { id: 'history.undo', keys: 'mod+z', actionId: 'history.undo', description: 'Undo last change' },
  {
    id: 'graph.deleteSelected',
    keys: 'delete, backspace',
    actionId: 'graph.requestDeleteSelected',
    description: 'Delete selected node or edge',
  },
  {
    id: 'search.toggle',
    keys: 'mod+f',
    actionId: 'search.toggle',
    description: 'Search nodes',
    enableOnFormTags: true,
  },
  {
    id: 'search.close',
    keys: 'escape',
    actionId: 'search.close',
    description: 'Close search',
    enableOnFormTags: true,
    enabled: (ctx) => ctx.searchOpen,
  },
];
