import { describe, expect, it } from '@jest/globals';

import { createEventEmitter } from '../../events/emitter.js';
import type { AgentLoopResult } from '../../agentLoop/agentLoopTypes.js';
import type { CallAgentOutput } from '../../core/types.js';
import { selectStepMachine } from '../selectStepMachine.js';
import type { StepMachineDeps } from '../selectStepMachine.js';
import type { StepMachine } from '../stepMachine.js';

const NONE = 0;
const ONE = 1;
const ZERO_TOKENS = { input: NONE, output: NONE, cached: NONE };

function baseDeps(): Pick<StepMachineDeps, 'emitter'> {
  return { emitter: createEventEmitter() };
}

function agentResult(over: Partial<AgentLoopResult>): AgentLoopResult {
  return { finalText: '', steps: ONE, totalTokens: ZERO_TOKENS, tokensLogs: [], toolCalls: [], ...over };
}

function workflowOutput(over: Partial<CallAgentOutput>): CallAgentOutput {
  return { message: null, tokensLogs: [], toolCalls: [], visitedNodes: [], debugMessages: {}, ...over };
}

function agentMachine(results: AgentLoopResult[]): StepMachine {
  const queue = [...results];
  return selectStepMachine('agent', {
    ...baseDeps(),
    runAgentLoop: async () => {
      await Promise.resolve();
      return queue.shift() ?? agentResult({});
    },
  });
}

function workflowMachine(output: CallAgentOutput | null): StepMachine {
  return selectStepMachine('workflow', {
    ...baseDeps(),
    runWorkflow: async () => {
      await Promise.resolve();
      return output;
    },
  });
}

describe('AgentStepMachine', () => {
  it('reports a dispatch then a terminal after injectChildResult', async () => {
    const machine = agentMachine([
      agentResult({ finalText: 'parent', dispatchResult: { __sentinel: 'dispatch', type: 'invoke_agent', params: {} } }),
      agentResult({ finalText: 'parent done' }),
    ]);
    const first = await machine.advance();
    expect(first.kind).toBe('dispatch');
    if (first.kind === 'dispatch') expect(first.sentinel.type).toBe('invoke_agent');
    machine.injectChildResult({ status: 'finished', result: 'child', outcome: 'success' });
    const second = await machine.advance();
    expect(second.kind).toBe('terminal');
    if (second.kind === 'terminal') expect(second.finalText).toBe('parent done');
  });

  it('surfaces finishResult on a terminal report', async () => {
    const finishResult = { __sentinel: 'finish', output: 'ok', status: 'success' } as const;
    const machine = agentMachine([agentResult({ finalText: 'done', finishResult })]);
    const report = await machine.advance();
    expect(report.kind).toBe('terminal');
    if (report.kind === 'terminal') expect(report.finishResult?.output).toBe('ok');
  });

  it('emits an assistant_message for non-empty finalText', async () => {
    const emitter = createEventEmitter();
    const machine = selectStepMachine('agent', {
      emitter,
      runAgentLoop: async () => {
        await Promise.resolve();
        return agentResult({ finalText: 'hello' });
      },
    });
    await machine.advance();
    emitter.close();
    const events = [];
    for await (const ev of emitter.events) events.push(ev);
    expect(events).toContainEqual({ type: 'assistant_message', text: 'hello', depth: NONE });
  });
});

describe('WorkflowStepMachine', () => {
  it('maps a null output to a terminal', async () => {
    const report = await workflowMachine(null).advance();
    expect(report.kind).toBe('terminal');
    if (report.kind === 'terminal') expect(report.finalText).toBe('');
  });

  it('surfaces a dispatch from CallAgentOutput.dispatchResult', async () => {
    const machine = workflowMachine(
      workflowOutput({ text: '', dispatchResult: { __sentinel: 'dispatch', type: 'invoke_workflow', params: {} } })
    );
    const report = await machine.advance();
    expect(report.kind).toBe('dispatch');
    if (report.kind === 'dispatch') expect(report.sentinel.type).toBe('invoke_workflow');
  });

  it('maps output.text to a terminal finalText', async () => {
    const report = await workflowMachine(workflowOutput({ text: 'wf done' })).advance();
    expect(report.kind).toBe('terminal');
    if (report.kind === 'terminal') expect(report.finalText).toBe('wf done');
  });
});

describe('selectStepMachine', () => {
  it('throws when the required engine closure is missing', () => {
    // The literal overloads give compile-time safety for well-formed calls; the
    // general overload still admits a missing closure, exercising the runtime
    // throw that remains as defense in depth.
    expect(() => selectStepMachine('agent', baseDeps())).toThrow(/runAgentLoop/v);
    expect(() => selectStepMachine('workflow', baseDeps())).toThrow(/runWorkflow/v);
  });
});
