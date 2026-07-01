import type { AgentLoopResult } from '../agentLoop/agentLoopTypes.js';
import type { CallAgentOutput } from '../core/types.js';
import type { EventEmitter } from '../events/emitter.js';
import type { AgentMachineDeps } from './agentStepMachine.js';
import { createAgentStepMachine } from './agentStepMachine.js';
import type { ChildResult } from './childResult.js';
import type { StepMachine } from './stepMachine.js';
import type { ExecutionType } from './types.js';
import type { WorkflowMachineDeps } from './workflowStepMachine.js';
import { createWorkflowStepMachine } from './workflowStepMachine.js';

/**
 * The union of per-engine closures the driver may provide. The relevant engine
 * closure is required for the matching `executionType`; the guards below narrow
 * to the concrete adapter deps without any type assertions.
 */
export interface StepMachineDeps {
  emitter: EventEmitter;
  runAgentLoop?: () => Promise<AgentLoopResult>;
  runWorkflow?: () => Promise<CallAgentOutput | null>;
  onChildResult?: (result: ChildResult) => void;
}

function toAgentDeps(deps: StepMachineDeps): AgentMachineDeps {
  const { runAgentLoop } = deps;
  if (runAgentLoop === undefined) {
    throw new Error("selectStepMachine('agent') requires deps.runAgentLoop");
  }
  return { emitter: deps.emitter, runAgentLoop, onChildResult: deps.onChildResult };
}

function toWorkflowDeps(deps: StepMachineDeps): WorkflowMachineDeps {
  const { runWorkflow } = deps;
  if (runWorkflow === undefined) {
    throw new Error("selectStepMachine('workflow') requires deps.runWorkflow");
  }
  return { emitter: deps.emitter, runWorkflow, onChildResult: deps.onChildResult };
}

/**
 * Engine-by-type selector: `'agent'` → {@link createAgentStepMachine},
 * `'workflow'` → {@link createWorkflowStepMachine}.
 */
export function selectStepMachine(executionType: ExecutionType, deps: StepMachineDeps): StepMachine {
  if (executionType === 'agent') {
    return createAgentStepMachine(toAgentDeps(deps));
  }
  return createWorkflowStepMachine(toWorkflowDeps(deps));
}
