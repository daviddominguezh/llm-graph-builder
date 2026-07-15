import type { EditorHistory, HistorySnapshot } from '../editor-history/historyStore';

export interface DispatchOptions {
  /** Snapshot to record instead of current state (pre-burst state for text sessions). */
  preState?: HistorySnapshot;
  /** Merges consecutive history entries produced by the same editing session. */
  coalesceKey?: string;
}

export interface EditorActionDef<P = void> {
  id: string;
  /** Undoable actions snapshot state (or opts.preState) before running. */
  undoable: boolean;
  run: (params: P) => void;
}

/**
 * Single entry point for editor mutations. Buttons, menus, and keyboard
 * shortcuts all dispatch actions by id — a new shortcut is a new caller of an
 * existing action, never duplicated mutation logic. The registry's only
 * coupling to undo: undoable actions push a history snapshot before running.
 *
 * `register` exposes a generic public signature for per-action param
 * type-safety, over an `unknown`-typed implementation. The overload bridges the
 * contravariance of `run: (params: P) => void`, letting the heterogeneous action
 * map hold typed defs without an (unsafe) type assertion. `dispatch` takes
 * `unknown` params — its id is a runtime string, so params cannot be tied to a
 * registered action's type at compile time.
 */
export class ActionRegistry {
  private readonly actions = new Map<string, EditorActionDef<unknown>>();

  constructor(
    private readonly history: EditorHistory,
    private readonly getState: () => HistorySnapshot
  ) {}

  register<P>(def: EditorActionDef<P>): void;
  register(def: EditorActionDef<unknown>): void {
    if (this.actions.has(def.id)) {
      throw new Error(`Action already registered: ${def.id}`);
    }
    this.actions.set(def.id, def);
  }

  dispatch(id: string, params: unknown, opts?: DispatchOptions): void {
    const def = this.actions.get(id);
    if (def === undefined) {
      throw new Error(`Unknown action: ${id}`);
    }

    if (def.undoable) {
      const snapshot = opts?.preState ?? this.getState();
      this.history.push({ ...snapshot, coalesceKey: opts?.coalesceKey });
    }
    def.run(params);
  }
}

export type Dispatch = ActionRegistry['dispatch'];
