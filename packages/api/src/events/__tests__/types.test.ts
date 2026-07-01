import { describe, expect, it } from '@jest/globals';

import type { ExecutionEvent, Tokens } from '../types.js';

const INPUT_TOKENS = 1;
const OUTPUT_TOKENS = 2;
const CACHED_TOKENS = 0;
const COST_USD = 0.01;
const DEPTH_ROOT = 0;
const DEPTH_CHILD = 1;
const PATCH_VALUE = 1;
const SNAPSHOT_VALUE = 1;

describe('ExecutionEvent union', () => {
  it('admits a node_exited event with tokens', () => {
    const tokens: Tokens = {
      input: INPUT_TOKENS,
      output: OUTPUT_TOKENS,
      cached: CACHED_TOKENS,
      costUSD: COST_USD,
    };
    const ev: ExecutionEvent = { type: 'node_exited', nodeId: 'n1', depth: DEPTH_ROOT, text: 'hi', tokens };
    expect(ev.type).toBe('node_exited');
  });

  it('admits the simulation state events', () => {
    const patch: ExecutionEvent = {
      type: 'simulation_state_patch',
      tool: 't',
      path: '/a',
      value: PATCH_VALUE,
    };
    const snap: ExecutionEvent = { type: 'simulation_state_snapshot', state: { a: SNAPSHOT_VALUE } };
    expect(patch.type).toBe('simulation_state_patch');
    expect(snap.type).toBe('simulation_state_snapshot');
  });

  it('admits child lifecycle events', () => {
    const fin: ExecutionEvent = {
      type: 'child_finished',
      childExecutionId: 'c1',
      depth: DEPTH_CHILD,
      result: { status: 'finished', result: 'done', outcome: 'success' },
    };
    expect(fin.type).toBe('child_finished');
  });
});
