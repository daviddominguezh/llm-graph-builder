'use client';

import { useEffect, useState } from 'react';

import type { HistorySnapshot } from '../editor-history/historyStore';

const DEFAULT_DEBOUNCE_MS = 800;
const INCREMENT = 1;

export interface CommittedFieldCommit {
  value: string;
  preState: HistorySnapshot;
  coalesceKey: string;
}

export interface CommittedFieldParams {
  value: string;
  fieldKey: string;
  getState: () => HistorySnapshot;
  onLiveChange: (value: string) => void;
  onCommit: (commit: CommittedFieldCommit) => void;
  debounceMs?: number;
}

export interface CommittedFieldApi {
  onChange: (value: string) => void;
  onBlur: () => void;
}

interface FieldSession {
  preState: HistorySnapshot;
  coalesceKey: string;
}

let sessionCounter = 0;

/**
 * Mutable per-field commit engine. Kept in a class (mutating `this`, not a
 * captured ref object) so it survives re-renders unchanged and stays clear of
 * the strict no-param-reassign / ref-in-render lint rules — same pattern as
 * OperationQueueCore behind useOperationQueue. Latest params flow in through
 * `setParams`, called from an effect on every render.
 */
class CommittedFieldCore {
  private session: FieldSession | null = null;
  private pending: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private params: CommittedFieldParams;

  readonly api: CommittedFieldApi;

  constructor(
    params: CommittedFieldParams,
    private lastCommitted: string
  ) {
    this.params = params;
    this.api = { onChange: this.onChange, onBlur: this.onBlur };
  }

  setParams(params: CommittedFieldParams): void {
    this.params = params;
  }

  onChange = (value: string): void => {
    this.openSession();
    this.pending = value;
    this.params.onLiveChange(value);
    this.clearTimer();
    const delay = this.params.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.timer = setTimeout(this.commit, delay);
  };

  onBlur = (): void => {
    this.commit();
    this.session = null;
  };

  dispose = (): void => {
    this.onBlur();
  };

  private openSession(): void {
    if (this.session !== null) return;
    sessionCounter += INCREMENT;
    this.session = {
      preState: this.params.getState(),
      coalesceKey: `${this.params.fieldKey}#${String(sessionCounter)}`,
    };
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private readonly commit = (): void => {
    this.clearTimer();
    const { session, pending } = this;
    if (session === null || pending === null || pending === this.lastCommitted) return;
    this.lastCommitted = pending;
    this.pending = null;
    this.params.onCommit({
      value: pending,
      preState: session.preState,
      coalesceKey: session.coalesceKey,
    });
  };
}

export function useCommittedField(params: CommittedFieldParams): CommittedFieldApi {
  const [core] = useState(() => new CommittedFieldCore(params, params.value));

  useEffect(() => {
    core.setParams(params);
  });

  useEffect(() => core.dispose, [core]);

  return core.api;
}
