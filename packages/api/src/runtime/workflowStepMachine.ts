import type { CallAgentOutput } from '../core/types.js';
import type { EventEmitter } from '../events/emitter.js';
import type { ChildResult } from './childResult.js';
import type { StepMachine, StepReport } from './stepMachine.js';

/**
 * Per-engine closures the driver (T17) supplies. `runWorkflow` owns the graph
 * traversal state and wires node callbacks into the emitter itself.
 */
export interface WorkflowMachineDeps {
  emitter: EventEmitter;
  runWorkflow: () => Promise<CallAgentOutput | null>;
  onChildResult?: (result: ChildResult) => void;
}

function reportFromOutput(output: CallAgentOutput | null): StepReport {
  if (output === null) {
    return { kind: 'terminal', finalText: '' };
  }
  if (output.dispatchResult !== undefined) {
    return { kind: 'dispatch', sentinel: output.dispatchResult };
  }
  return { kind: 'terminal', finalText: output.text ?? '', finishResult: output.finishResult };
}

/**
 * Wraps the WORKFLOW engine. A single {@link StepMachine.advance} runs it to its
 * next decision: `dispatchResult` → `{ kind: 'dispatch' }`, a `null` output or a
 * plain output → `{ kind: 'terminal' }`.
 */
export function createWorkflowStepMachine(deps: WorkflowMachineDeps): StepMachine {
  return {
    advance: async (): Promise<StepReport> => reportFromOutput(await deps.runWorkflow()),
    injectChildResult: (result: ChildResult): void => {
      deps.onChildResult?.(result);
    },
  };
}
