import { describe, expect, it } from '@jest/globals';

import type { ExecutionEvent, Tokens } from '../types.js';

// §5 emitter-completeness guard: every field each RU5 SSE consumer needs must be
// CONSTRUCTIBLE from the ExecutionEvent union. Each `const x: ExecutionEvent = { ... }`
// is a compile-time assignability check — if a consumer shape has no home in the union,
// this file fails to typecheck and the whole run fails. The runtime `expect(...)` calls
// keep the guard non-vacuous by exercising the constructed values at module scope
// (kept out of the `it` bodies to respect max-lines-per-function).

const DEPTH_ROOT = 0;
const DEPTH_CHILD = 1;
const SAMPLE_DURATION_MS = 5;
const SAMPLE_VALUE = 1;
const ZERO_TOKENS: Tokens = { input: DEPTH_ROOT, output: DEPTH_ROOT, cached: DEPTH_ROOT };

// --- Production API consumer: text, toolCall, tokenUsage, structuredOutput, nodeError, done ---
const prodText: ExecutionEvent = { type: 'assistant_message', text: 'x', depth: DEPTH_ROOT };
const prodToolCall: ExecutionEvent = {
  type: 'tool_call',
  toolName: 't',
  toolCallId: 'i',
  args: {},
  depth: DEPTH_ROOT,
  isMcp: false,
};
const prodTokenUsage: ExecutionEvent = {
  type: 'node_exited',
  nodeId: 'n',
  depth: DEPTH_ROOT,
  tokens: ZERO_TOKENS,
};
const prodStructured: ExecutionEvent = {
  type: 'node_exited',
  nodeId: 'n',
  depth: DEPTH_ROOT,
  structuredOutput: { nodeId: 'n', data: {} },
};
const prodNodeError: ExecutionEvent = { type: 'node_error', nodeId: 'n', message: 'm', depth: DEPTH_ROOT };
const prodDone: ExecutionEvent = {
  type: 'finished',
  result: 'r',
  tokens: ZERO_TOKENS,
  structuredOutputs: {},
};
const productionEvents: ExecutionEvent[] = [
  prodText,
  prodToolCall,
  prodTokenUsage,
  prodStructured,
  prodNodeError,
  prodDone,
];

// --- Simulation panel consumer: step(reasoning), tool_result, child_*, snapshot/patch ---
const simStep: ExecutionEvent = {
  type: 'node_exited',
  nodeId: 'n',
  depth: DEPTH_ROOT,
  reasoning: 'why',
  durationMs: SAMPLE_DURATION_MS,
};
const simToolResult: ExecutionEvent = { type: 'tool_result', toolCallId: 'i', result: {}, depth: DEPTH_ROOT };
const simAwaiting: ExecutionEvent = {
  type: 'child_awaiting_input',
  childExecutionId: 'c',
  partial: 'p',
  depth: DEPTH_CHILD,
};
const simDispatched: ExecutionEvent = {
  type: 'child_dispatched',
  childExecutionId: 'c',
  dispatchType: 'invoke_agent',
  task: 't',
  depth: DEPTH_CHILD,
};
const simPatch: ExecutionEvent = {
  type: 'simulation_state_patch',
  tool: 't',
  path: '/a',
  value: SAMPLE_VALUE,
};
const simSnapshot: ExecutionEvent = { type: 'simulation_state_snapshot', state: {} };
const simulationEvents: ExecutionEvent[] = [
  simStep,
  simToolResult,
  simAwaiting,
  simDispatched,
  simPatch,
  simSnapshot,
];

// --- Widget consumer: text + done ---
const widgetText: ExecutionEvent = { type: 'assistant_message', text: 'x', depth: DEPTH_ROOT };
const widgetDone: ExecutionEvent = { type: 'finished', result: 'r' };
const widgetEvents: ExecutionEvent[] = [widgetText, widgetDone];

describe('ExecutionEvent superset completeness (RU5 consumer guard)', () => {
  it('production API: text, toolCall, tokenUsage, structuredOutput, nodeError, done', () => {
    expect(productionEvents.map((e) => e.type)).toEqual([
      'assistant_message',
      'tool_call',
      'node_exited',
      'node_exited',
      'node_error',
      'finished',
    ]);
  });

  it('simulation panel: step(reasoning), tool_result, child_*, snapshot/patch', () => {
    expect(simulationEvents.map((e) => e.type)).toEqual([
      'node_exited',
      'tool_result',
      'child_awaiting_input',
      'child_dispatched',
      'simulation_state_patch',
      'simulation_state_snapshot',
    ]);
  });

  it('widget: text + done', () => {
    expect(widgetEvents.map((e) => e.type)).toEqual(['assistant_message', 'finished']);
  });
});
