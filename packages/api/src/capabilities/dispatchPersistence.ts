import type { ChildResult } from '../runtime/childResult.js';

export interface DispatchHandle {
  executionId: string;
  childExecutionId: string;
}

export interface BeforeDispatchArgs {
  executionId: string;
  parentSnapshot: unknown;
  childInput: unknown;
}

export interface OnChildFinishArgs {
  handle: DispatchHandle;
  childResult: ChildResult;
}

export interface OnChildErrorArgs {
  handle: DispatchHandle;
  error: unknown;
}

export interface DispatchPersistence {
  beforeDispatch: (args: BeforeDispatchArgs) => Promise<DispatchHandle>;
  onChildFinish: (args: OnChildFinishArgs) => Promise<void>;
  onChildError: (args: OnChildErrorArgs) => Promise<void>;
  listPending: (executionId: string) => Promise<DispatchHandle[]>;
}
