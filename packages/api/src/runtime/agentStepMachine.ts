import type { AgentLoopResult } from '../agentLoop/agentLoopTypes.js';
import type { EventEmitter } from '../events/emitter.js';
import type { ChildResult } from './childResult.js';
import type { StepMachine, StepReport } from './stepMachine.js';

/**
 * Per-engine closures the driver (T17) supplies. `runAgentLoop` owns the agent
 * loop config and message list, so a child result injected via
 * {@link StepMachine.injectChildResult} is visible to the NEXT `runAgentLoop`.
 */
export interface AgentMachineDeps {
  emitter: EventEmitter;
  runAgentLoop: () => Promise<AgentLoopResult>;
  onChildResult?: (result: ChildResult) => void;
}

const ROOT_DEPTH = 0;

function reportFromLoop(result: AgentLoopResult): StepReport {
  if (result.dispatchResult !== undefined) {
    return { kind: 'dispatch', sentinel: result.dispatchResult };
  }
  return { kind: 'terminal', finalText: result.finalText, finishResult: result.finishResult };
}

function emitAssistant(emitter: EventEmitter, finalText: string): void {
  if (finalText !== '') {
    emitter.emit({ type: 'assistant_message', text: finalText, depth: ROOT_DEPTH });
  }
}

/**
 * Wraps the AGENT engine. A single {@link StepMachine.advance} runs the loop to
 * its next decision: a `dispatchResult` surfaces as `{ kind: 'dispatch' }`,
 * otherwise the loop terminated → `{ kind: 'terminal' }`.
 */
export function createAgentStepMachine(deps: AgentMachineDeps): StepMachine {
  return {
    advance: async (): Promise<StepReport> => {
      const result = await deps.runAgentLoop();
      emitAssistant(deps.emitter, result.finalText);
      return reportFromLoop(result);
    },
    injectChildResult: (result: ChildResult): void => {
      deps.onChildResult?.(result);
    },
  };
}
