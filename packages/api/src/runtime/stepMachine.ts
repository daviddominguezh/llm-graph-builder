import type { Tokens } from '../events/types.js';
import type { DispatchSentinel, FinishSentinel } from '../types/sentinels.js';
import type { ChildResult } from './childResult.js';

/**
 * The outcome of a single {@link StepMachine.advance} call. Both engines
 * (agent loop, workflow graph) normalise their result into one of these shapes
 * so the driver (T15 `executeTurn`) can react uniformly.
 */
export type StepReport =
  | {
      kind: 'step';
      assistantText?: string;
      nodeId?: string;
      tokens?: Tokens;
      reasoning?: string;
      durationMs?: number;
    }
  | { kind: 'dispatch'; sentinel: DispatchSentinel }
  | { kind: 'awaiting_input'; partial: string }
  | { kind: 'terminal'; finalText: string; finishResult?: FinishSentinel };

/**
 * The two-engine seam. An engine adapter runs the next step and reports the
 * outcome; the driver threads a resolved child result back in before resuming.
 */
export interface StepMachine {
  advance: () => Promise<StepReport>;
  injectChildResult: (result: ChildResult) => void;
}
