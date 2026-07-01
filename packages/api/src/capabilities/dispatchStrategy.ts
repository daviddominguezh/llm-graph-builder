import type { ChildResult } from '../runtime/childResult.js';
import type { DispatchHandle } from './dispatchPersistence.js';

export interface DispatchArgs {
  dispatchDepth: number;
  maxDispatchDepth: number;
  runChild: () => Promise<ChildResult>;
}

export type DispatchOutcome =
  | { kind: 'completed'; childResult: ChildResult }
  | { kind: 'suspended'; handle: DispatchHandle };

export interface DispatchStrategy {
  dispatch: (args: DispatchArgs) => Promise<DispatchOutcome>;
}
