import { describe, expect, it } from '@jest/globals';

import type { ExecutionEvent } from '@daviddh/llm-graph-runner';

import { executionEventToSim } from '../executionEventBridge.js';

/* --- Numeric fixtures (no-magic-numbers: named scalar constants) --- */

const ZERO = 0;
const ONE = 1;
const TWO = 2;
const THREE = 3;
const FOUR = 4;

const ZERO_TOKENS = { input: ZERO, output: ZERO, cached: ZERO };
const TOKENS_A = { input: ONE, output: TWO, cached: ZERO };
const TOKENS_B = { input: THREE, output: FOUR, cached: ONE };

interface Case {
  name: string;
  event: ExecutionEvent;
  expected: unknown;
}

/* --- Agent engine cases (every ExecutionEvent kind the FE consumes + nulls) --- */

const agentCases: Case[] = [
  {
    name: 'child_awaiting_input → child_waiting',
    event: { type: 'child_awaiting_input', childExecutionId: 'c', partial: 'p', depth: ONE },
    expected: { type: 'child_waiting', depth: ONE, text: 'p' },
  },
  {
    name: 'child_finished (finished/success) → child_finished',
    event: {
      type: 'child_finished',
      childExecutionId: 'c',
      depth: ONE,
      result: { status: 'finished', result: 'done', outcome: 'success' },
      tokens: TOKENS_A,
    },
    expected: { type: 'child_finished', depth: ONE, output: 'done', status: 'success', tokens: TOKENS_A },
  },
  {
    name: 'child_finished (error) → status error, empty output, zero-token fallback',
    event: {
      type: 'child_finished',
      childExecutionId: 'c',
      depth: TWO,
      result: { status: 'error', code: 'child_failed', message: 'boom' },
    },
    expected: { type: 'child_finished', depth: TWO, output: '', status: 'error', tokens: ZERO_TOKENS },
  },
  { name: 'finished → simulation_complete', event: { type: 'finished', result: 'x' }, expected: { type: 'simulation_complete' } },
  {
    name: 'error → { error, message }',
    event: { type: 'error', code: 'boom', message: 'bad' },
    expected: { type: 'error', message: 'bad' },
  },
  {
    name: 'simulation_state_snapshot forwarded 1:1 (temporary extension)',
    event: { type: 'simulation_state_snapshot', state: { a: ONE } },
    expected: { type: 'simulation_state_snapshot', state: { a: ONE } },
  },
  {
    name: 'simulation_state_patch forwarded 1:1 (temporary extension)',
    event: { type: 'simulation_state_patch', tool: 't', path: '/a', value: ONE },
    expected: { type: 'simulation_state_patch', tool: 't', path: '/a', value: ONE },
  },
  { name: 'node_entered → null (agent has no node stream)', event: { type: 'node_entered', nodeId: 'n', depth: ZERO }, expected: null },
  { name: 'node_exited → null (driver emits step_processed)', event: { type: 'node_exited', nodeId: 'n', depth: ZERO }, expected: null },
  { name: 'assistant_message → null (driver emits agent_response)', event: { type: 'assistant_message', text: 'hi', depth: ZERO }, expected: null },
  {
    name: 'tool_call → null (driver emits tool_executed)',
    event: { type: 'tool_call', toolName: 't', toolCallId: 'id', args: {}, depth: ZERO, isMcp: false },
    expected: null,
  },
  { name: 'tool_result → null', event: { type: 'tool_result', toolCallId: 'id', result: {}, depth: ZERO }, expected: null },
  {
    name: 'child_dispatched → null (driver emits with parent metadata)',
    event: { type: 'child_dispatched', childExecutionId: 'c', dispatchType: 'invoke_agent', task: 't', depth: ONE },
    expected: null,
  },
  { name: 'child_suspended → null (durable-only)', event: { type: 'child_suspended', childExecutionId: 'c', depth: ONE }, expected: null },
  { name: 'node_error → null', event: { type: 'node_error', nodeId: 'n', message: 'e', depth: ZERO }, expected: null },
];

/* --- Workflow engine cases --- */

const workflowCases: Case[] = [
  { name: 'node_entered → node_visited', event: { type: 'node_entered', nodeId: 'n1', depth: ZERO }, expected: { type: 'node_visited', nodeId: 'n1' } },
  {
    name: 'child_finished → child_finished (Decision 7, temporary workflow member)',
    event: {
      type: 'child_finished',
      childExecutionId: 'c',
      depth: ONE,
      result: { status: 'finished', result: 'r', outcome: 'error' },
      tokens: TOKENS_B,
    },
    expected: { type: 'child_finished', depth: ONE, output: 'r', status: 'error', tokens: TOKENS_B },
  },
  { name: 'finished → simulation_complete', event: { type: 'finished', result: 'x' }, expected: { type: 'simulation_complete' } },
  {
    name: 'error → { error, message }',
    event: { type: 'error', code: 'boom', message: 'bad' },
    expected: { type: 'error', message: 'bad' },
  },
  {
    name: 'simulation_state_snapshot forwarded 1:1 (temporary extension)',
    event: { type: 'simulation_state_snapshot', state: { b: TWO } },
    expected: { type: 'simulation_state_snapshot', state: { b: TWO } },
  },
  {
    name: 'simulation_state_patch forwarded 1:1 (temporary extension)',
    event: { type: 'simulation_state_patch', tool: 'u', path: '/b', value: TWO },
    expected: { type: 'simulation_state_patch', tool: 'u', path: '/b', value: TWO },
  },
  { name: 'node_exited → null', event: { type: 'node_exited', nodeId: 'n', depth: ZERO }, expected: null },
  { name: 'assistant_message → null', event: { type: 'assistant_message', text: 'hi', depth: ZERO }, expected: null },
  {
    name: 'tool_call → null',
    event: { type: 'tool_call', toolName: 't', toolCallId: 'id', args: {}, depth: ZERO, isMcp: false },
    expected: null,
  },
  { name: 'tool_result → null', event: { type: 'tool_result', toolCallId: 'id', result: {}, depth: ZERO }, expected: null },
  {
    name: 'child_dispatched → null (driver emits with parent metadata)',
    event: { type: 'child_dispatched', childExecutionId: 'c', dispatchType: 'invoke_agent', task: 't', depth: ONE },
    expected: null,
  },
  { name: 'child_suspended → null (durable-only)', event: { type: 'child_suspended', childExecutionId: 'c', depth: ONE }, expected: null },
  { name: 'child_awaiting_input → null (agent-only surface)', event: { type: 'child_awaiting_input', childExecutionId: 'c', partial: 'p', depth: ONE }, expected: null },
  { name: 'node_error → null', event: { type: 'node_error', nodeId: 'n', message: 'e', depth: ZERO }, expected: null },
];

describe('executionEventToSim (agent)', () => {
  it.each(agentCases)('maps $name', ({ event, expected }) => {
    expect(executionEventToSim(event, 'agent')).toEqual(expected);
  });
});

describe('executionEventToSim (workflow)', () => {
  it.each(workflowCases)('maps $name', ({ event, expected }) => {
    expect(executionEventToSim(event, 'workflow')).toEqual(expected);
  });
});
