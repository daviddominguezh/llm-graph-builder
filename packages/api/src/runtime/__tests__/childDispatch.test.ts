import { describe, expect, it } from '@jest/globals';

import type { DispatchArgs, DispatchOutcome, DispatchStrategy } from '../../capabilities/dispatchStrategy.js';
import { createEventEmitter } from '../../events/emitter.js';
import type { ExecutionEvent } from '../../events/types.js';
import { syncRecurseStrategy } from '../../simulation/syncRecurseStrategy.js';
import type { ChildDispatchArgs, ChildTermination } from '../childDispatch.js';
import { childDispatch } from '../childDispatch.js';

const ROOT_DEPTH = 0;
const MAX_DEPTH = 10;
const AT_LIMIT_DEPTH = 10;
const CHILD_DEPTH = 1;
const OVER_LIMIT_CHILD_DEPTH = 11;

async function drain(it: AsyncIterable<ExecutionEvent>): Promise<ExecutionEvent[]> {
  const out: ExecutionEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

async function emptyTermination(): Promise<ChildTermination> {
  await Promise.resolve();
  return { lastAssistantText: '' };
}

async function finishTermination(): Promise<ChildTermination> {
  await Promise.resolve();
  return { finishResult: { __sentinel: 'finish', output: 'done', status: 'success' }, lastAssistantText: '' };
}

async function awaitingTermination(): Promise<ChildTermination> {
  await Promise.resolve();
  return { lastAssistantText: 'hold on' };
}

function baseArgs(over: Partial<ChildDispatchArgs>): ChildDispatchArgs {
  return {
    sentinel: { __sentinel: 'dispatch', type: 'invoke_agent', params: {} },
    dispatchDepth: ROOT_DEPTH,
    maxDispatchDepth: MAX_DEPTH,
    environment: 'simulation',
    strategy: syncRecurseStrategy,
    emitter: createEventEmitter(),
    childExecutionId: 'c1',
    task: 'do it',
    runChildToTermination: emptyTermination,
    ...over,
  };
}

describe('childDispatch — finishing child', () => {
  it('emits child_dispatched then child_finished (sim)', async () => {
    const emitter = createEventEmitter();
    const result = await childDispatch(
      baseArgs({ emitter, childExecutionId: 'c1', runChildToTermination: finishTermination })
    );
    emitter.close();
    expect(result).toEqual({ status: 'finished', result: 'done', outcome: 'success' });
    const events = await drain(emitter.events);
    const [dispatched, finished] = events;
    expect(events.map((e) => e.type)).toEqual(['child_dispatched', 'child_finished']);
    expect(dispatched).toMatchObject({
      childExecutionId: 'c1',
      dispatchType: 'invoke_agent',
      task: 'do it',
      depth: CHILD_DEPTH,
    });
    expect(finished).toMatchObject({
      childExecutionId: 'c1',
      depth: CHILD_DEPTH,
      result: { status: 'finished', result: 'done', outcome: 'success' },
    });
  });
});

describe('childDispatch — awaiting-input child', () => {
  it('emits child_awaiting_input for an END-without-finish child in sim', async () => {
    const emitter = createEventEmitter();
    const result = await childDispatch(
      baseArgs({ emitter, childExecutionId: 'c2', runChildToTermination: awaitingTermination })
    );
    emitter.close();
    expect(result).toEqual({ status: 'awaiting_input', partial: 'hold on' });
    const events = await drain(emitter.events);
    const [, awaiting] = events;
    expect(events.map((e) => e.type)).toEqual(['child_dispatched', 'child_awaiting_input']);
    expect(awaiting).toMatchObject({ childExecutionId: 'c2', partial: 'hold on', depth: CHILD_DEPTH });
  });
});

describe('childDispatch — over-depth', () => {
  it('maps to max_depth_exceeded and never runs the child', async () => {
    const emitter = createEventEmitter();
    let ran = false;
    const runChildToTermination = async (): Promise<ChildTermination> => {
      ran = true;
      await Promise.resolve();
      return { lastAssistantText: 'nope' };
    };
    const result = await childDispatch(
      baseArgs({ emitter, dispatchDepth: AT_LIMIT_DEPTH, childExecutionId: 'c3', runChildToTermination })
    );
    emitter.close();
    expect(ran).toBe(false);
    expect(result).toEqual({
      status: 'error',
      code: 'max_depth_exceeded',
      message: 'Max dispatch depth exceeded.',
    });
    const events = await drain(emitter.events);
    const [, finished] = events;
    expect(events.map((e) => e.type)).toEqual(['child_dispatched', 'child_finished']);
    expect(finished).toMatchObject({
      depth: OVER_LIMIT_CHILD_DEPTH,
      result: { code: 'max_depth_exceeded' },
    });
  });
});

describe('childDispatch — suspended outcome', () => {
  it('emits child_suspended and returns child_failed', async () => {
    const emitter = createEventEmitter();
    const suspendStrategy: DispatchStrategy = {
      dispatch: async (_args: DispatchArgs): Promise<DispatchOutcome> => {
        await Promise.resolve();
        return { kind: 'suspended', handle: { executionId: 'd1', childExecutionId: 'c4' } };
      },
    };
    const result = await childDispatch(
      baseArgs({ emitter, strategy: suspendStrategy, childExecutionId: 'c4' })
    );
    emitter.close();
    expect(result).toMatchObject({ status: 'error', code: 'child_failed' });
    const events = await drain(emitter.events);
    const [, suspended] = events;
    expect(events.map((e) => e.type)).toEqual(['child_dispatched', 'child_suspended']);
    expect(suspended).toMatchObject({ childExecutionId: 'c4', depth: CHILD_DEPTH });
  });
});
