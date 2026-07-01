import { describe, expect, it } from '@jest/globals';

import type { RuntimeCapabilities, RuntimeServices } from '../../capabilities/index.js';
import { createEventEmitter } from '../../events/emitter.js';
import type { ExecutionEvent } from '../../events/types.js';
import {
  consoleLogger,
  consoleObservability,
  noopRateLimit,
} from '../../simulation/consoleCapabilities.js';
import { noopPersistence } from '../../simulation/noopPersistence.js';
import { syncRecurseStrategy } from '../../simulation/syncRecurseStrategy.js';
import type { ChildResult } from '../childResult.js';
import type { ExecuteTurnArgs } from '../executeTurn.js';
import { executeTurn } from '../executeTurn.js';
import type { StepMachine, StepReport } from '../stepMachine.js';

const ROOT_DEPTH = 0;
const MAX_DEPTH = 10;
const ONE_MESSAGE = 1;

async function childFinishing(output: string): Promise<{
  finishResult: { __sentinel: 'finish'; output: string; status: 'success' };
  lastAssistantText: string;
}> {
  await Promise.resolve();
  return { finishResult: { __sentinel: 'finish', output, status: 'success' }, lastAssistantText: '' };
}

function dispatchReport(type: 'invoke_agent' | 'invoke_workflow'): StepReport {
  return { kind: 'dispatch', sentinel: { __sentinel: 'dispatch', type, params: {} } };
}

const caps: RuntimeCapabilities = {
  persistence: noopPersistence,
  dispatch: syncRecurseStrategy,
  observability: consoleObservability,
  rateLimit: noopRateLimit,
  logger: consoleLogger,
};

const services: RuntimeServices = {
  mcpPool: {
    invoke: async () => {
      await Promise.resolve();
      return {};
    },
  },
  resolveChildConfig: async () => {
    await Promise.resolve();
    return {
      systemPrompt: 's',
      context: 'c',
      modelId: 'm',
      maxSteps: null,
      mcpServers: [],
      skills: [],
      isChildAgent: true,
      task: 't',
    };
  },
  supabase: {},
};

async function drain(it: AsyncIterable<ExecutionEvent>): Promise<ExecutionEvent[]> {
  const out: ExecutionEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

async function emptyTermination(): Promise<{ lastAssistantText: string }> {
  await Promise.resolve();
  return { lastAssistantText: '' };
}

function scriptedMachine(reports: StepReport[], onInject?: (r: ChildResult) => void): StepMachine {
  const queue = [...reports];
  return {
    advance: async (): Promise<StepReport> => {
      await Promise.resolve();
      const report = queue.shift();
      if (report === undefined) throw new Error('machine advanced past its script');
      return report;
    },
    injectChildResult: (r: ChildResult): void => onInject?.(r),
  };
}

function baseArgs(machine: StepMachine, overrides: Partial<ExecuteTurnArgs> = {}): ExecuteTurnArgs {
  return {
    environment: 'simulation',
    executionType: 'agent',
    dispatchDepth: ROOT_DEPTH,
    maxDispatchDepth: MAX_DEPTH,
    capabilities: caps,
    services,
    machine,
    runChildToTermination: emptyTermination,
    ...overrides,
  };
}

function finishReport(output: string): StepReport {
  return { kind: 'terminal', finalText: '', finishResult: { __sentinel: 'finish', output, status: 'success' } };
}

describe('executeTurn — terminal with finishResult', () => {
  it('finishes an agent turn with the finish output', async () => {
    const out = await executeTurn(baseArgs(scriptedMachine([finishReport('done')])));
    expect(out.finalResult).toBe('done');
    expect(out.executionType).toBe('agent');
    expect((await drain(out.events)).map((e) => e.type)).toContain('finished');
  });

  it('finishes a workflow turn in a production ctx', async () => {
    const out = await executeTurn(
      baseArgs(scriptedMachine([finishReport('wf')]), {
        executionType: 'workflow',
        environment: 'production',
      })
    );
    expect(out.finalResult).toBe('wf');
    expect(out.executionType).toBe('workflow');
    expect(out.environment).toBe('production');
  });
});

describe('executeTurn — awaiting-input materialization', () => {
  it('turns a sim terminal without finishResult into the partial reply', async () => {
    const out = await executeTurn(
      baseArgs(scriptedMachine([{ kind: 'terminal', finalText: 'partial reply' }]))
    );
    expect(out.finalResult).toBe('partial reply');
    expect((await drain(out.events)).map((e) => e.type)).toContain('finished');
  });
});

describe('executeTurn — dispatch loop', () => {
  it('runs childDispatch, re-injects the result, and continues', async () => {
    const injected: ChildResult[] = [];
    const machine = scriptedMachine([dispatchReport('invoke_workflow'), finishReport('parent done')], (r) =>
      injected.push(r)
    );
    const out = await executeTurn(
      baseArgs(machine, { runChildToTermination: async () => await childFinishing('child') })
    );
    expect(out.finalResult).toBe('parent done');
    expect(injected).toEqual([{ status: 'finished', result: 'child', outcome: 'success' }]);
    const types = (await drain(out.events)).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['child_dispatched', 'child_finished', 'finished']));
  });

  it('emits child_dispatched, then child_finished, then finished in order', async () => {
    const machine = scriptedMachine([dispatchReport('invoke_agent'), { kind: 'terminal', finalText: 'end' }]);
    const out = await executeTurn(
      baseArgs(machine, { runChildToTermination: async () => await childFinishing('c') })
    );
    const types = (await drain(out.events)).map((e) => e.type);
    expect(types.indexOf('child_dispatched')).toBeLessThan(types.indexOf('child_finished'));
    expect(types.indexOf('child_finished')).toBeLessThan(types.indexOf('finished'));
  });
});

describe('executeTurn — assistant_message ownership', () => {
  it('does not double-emit the final assistant_message (the adapter owns it)', async () => {
    const emitter = createEventEmitter();
    const machine: StepMachine = {
      advance: async (): Promise<StepReport> => {
        await Promise.resolve();
        emitter.emit({ type: 'assistant_message', text: 'hi', depth: ROOT_DEPTH });
        return { kind: 'terminal', finalText: 'hi' };
      },
      injectChildResult: (): void => undefined,
    };
    const out = await executeTurn(baseArgs(machine, { emitter }));
    const assistant = (await drain(out.events)).filter((e) => e.type === 'assistant_message');
    expect(assistant).toHaveLength(ONE_MESSAGE);
    expect(out.finalResult).toBe('hi');
  });
});
