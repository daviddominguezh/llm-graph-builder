import { describe, expect, it } from '@jest/globals';

import type { ExecutionEvent } from '../../events/types.js';
import type { DeepReadonly, ExecutionType, RuntimeOutput } from '../types.js';
import { MAX_CHILD_RUNTIME_MS, MAX_DISPATCH_DEPTH } from '../types.js';

const EXPECTED_DISPATCH_DEPTH = 3;
const EXPECTED_CHILD_RUNTIME_MS = 3_600_000;
const NESTED_VALUE = 1;
const ROOT_DEPTH = 0;

async function* makeEvents(): AsyncGenerator<ExecutionEvent> {
  await Promise.resolve();
  yield { type: 'node_entered', nodeId: 'n1', depth: ROOT_DEPTH };
}

describe('runtime constants', () => {
  it('is the single configurable dispatch cap, default 3', () => {
    expect(MAX_DISPATCH_DEPTH).toBe(EXPECTED_DISPATCH_DEPTH);
    expect(MAX_CHILD_RUNTIME_MS).toBe(EXPECTED_CHILD_RUNTIME_MS);
  });
});

describe('DeepReadonly + RuntimeOutput', () => {
  it('compiles a frozen nested shape and a simulation output', () => {
    const ro: DeepReadonly<{ a: { b: number } }> = { a: { b: NESTED_VALUE } };
    const et: ExecutionType = 'agent';
    const out: RuntimeOutput = {
      environment: 'simulation',
      executionType: 'workflow',
      finalResult: 'done',
      events: makeEvents(),
    };
    expect(ro.a.b).toBe(NESTED_VALUE);
    expect(et).toBe('agent');
    expect(out.environment).toBe('simulation');
  });
});
