import type { ExecutionEvent, ExecutionType, Tokens } from '@daviddh/llm-graph-runner';

import type { AgentSimulationEvent } from '../routes/simulateAgentTypes.js';
import type { SimulationEvent } from '../types.js';

/**
 * THROWAWAY RU3 bridge: maps the unified runtime `ExecutionEvent` superset onto
 * today's per-engine legacy sim-SSE unions so the current FE simulation
 * consumers keep working until RU5's full cutover, at which point this whole
 * file (and the two temporary union members below) is deleted.
 *
 * The `simulation_state_patch`/`simulation_state_snapshot` members do not exist
 * on either legacy union yet, so the extended unions are defined LOCALLY here
 * (scoped to the bridge) rather than polluting the shared sim types. Task 18's
 * SSE panel consumes them off the stream, validating the runtime→FE sim-state
 * model end-to-end.
 */

/* --- Temporary bridge-only union extensions (removed at RU5) --- */

export interface SimulationStatePatchSseEvent {
  type: 'simulation_state_patch';
  tool: string;
  path: string;
  value: unknown;
}

export interface SimulationStateSnapshotSseEvent {
  type: 'simulation_state_snapshot';
  state: Record<string, unknown>;
}

/** Workflow `child_finished` is new behavior (Decision 7); the legacy workflow
 * union stopped at dispatch, so this member is temporarily added here too. */
export interface ChildFinishedSseEvent {
  type: 'child_finished';
  depth: number;
  output: string;
  status: 'success' | 'error';
  tokens: Tokens;
}

export type AgentSimEvent =
  | AgentSimulationEvent
  | SimulationStatePatchSseEvent
  | SimulationStateSnapshotSseEvent;

export type WorkflowSimEvent =
  | SimulationEvent
  | SimulationStatePatchSseEvent
  | SimulationStateSnapshotSseEvent
  | ChildFinishedSseEvent;

/* --- Shared mappers --- */

const ZERO = 0;
const ZERO_TOKENS: Tokens = { input: ZERO, output: ZERO, cached: ZERO };

type ChildFinished = Extract<ExecutionEvent, { type: 'child_finished' }>;

function childFinishedToSim(ev: ChildFinished): ChildFinishedSseEvent {
  const { result } = ev;
  const output = result.status === 'finished' ? result.result : '';
  const status = result.status === 'finished' ? result.outcome : 'error';
  return { type: 'child_finished', depth: ev.depth, output, status, tokens: ev.tokens ?? ZERO_TOKENS };
}

/* --- Per-engine mapping --- */

function agentEventToSim(ev: ExecutionEvent): AgentSimEvent | null {
  switch (ev.type) {
    case 'child_awaiting_input':
      return { type: 'child_waiting', depth: ev.depth, text: ev.partial };
    case 'child_finished':
      return childFinishedToSim(ev);
    case 'finished':
      return { type: 'simulation_complete' };
    case 'error':
      return { type: 'error', message: ev.message };
    case 'simulation_state_patch':
      return { type: 'simulation_state_patch', tool: ev.tool, path: ev.path, value: ev.value };
    case 'simulation_state_snapshot':
      return { type: 'simulation_state_snapshot', state: ev.state };
    default:
      return null;
  }
}

function workflowEventToSim(ev: ExecutionEvent): WorkflowSimEvent | null {
  switch (ev.type) {
    case 'node_entered':
      return { type: 'node_visited', nodeId: ev.nodeId };
    case 'child_finished':
      return childFinishedToSim(ev);
    case 'finished':
      return { type: 'simulation_complete' };
    case 'error':
      return { type: 'error', message: ev.message };
    case 'simulation_state_patch':
      return { type: 'simulation_state_patch', tool: ev.tool, path: ev.path, value: ev.value };
    case 'simulation_state_snapshot':
      return { type: 'simulation_state_snapshot', state: ev.state };
    default:
      return null;
  }
}

/**
 * Map an `ExecutionEvent` to the legacy sim-SSE event for the given engine, or
 * `null` when the FE does not consume it here (durable-only kinds, or events the
 * T18 driver emits directly with richer parent metadata the bridge lacks — e.g.
 * `child_dispatched`, `assistant_message` — so the bridge stays silent to avoid
 * double emission).
 */
export function executionEventToSim(
  ev: ExecutionEvent,
  executionType: ExecutionType
): AgentSimEvent | WorkflowSimEvent | null {
  return executionType === 'agent' ? agentEventToSim(ev) : workflowEventToSim(ev);
}
