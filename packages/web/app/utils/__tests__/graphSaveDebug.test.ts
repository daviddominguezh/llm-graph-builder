import type { Operation } from '@daviddh/graph-types';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { DebugGraphState } from '../graphSaveDebug';

const sendOperationsMock = jest.fn<(agentId: string, ops: Operation[]) => Promise<void>>();
const fetchGraphOrAgentConfigMock = jest.fn<(agentId: string) => Promise<unknown>>();

jest.unstable_mockModule('../../lib/graphApi', () => ({
  sendOperations: sendOperationsMock,
  fetchGraphOrAgentConfig: fetchGraphOrAgentConfigMock,
}));

const { sendOperationsDebugged } = await import('../graphSaveDebug');

const AGENT_ID = 'agent-1';

function graphState(edges: DebugGraphState['edges'], nodeIds: string[]): DebugGraphState {
  return { nodes: nodeIds.map((id) => ({ id })), edges };
}

const localState = graphState([{ from: 'start', to: 'a', preconditions: [{}] }], ['start', 'a']);

const ops: Operation[] = [
  { type: 'insertNode', data: { nodeId: 'a', text: 't', kind: 'agent' } },
  { type: 'insertEdge', data: { from: 'start', to: 'a' } },
];

interface ConsoleSpies {
  log: jest.SpiedFunction<typeof console.log>;
  warn: jest.SpiedFunction<typeof console.warn>;
  error: jest.SpiedFunction<typeof console.error>;
  group: jest.SpiedFunction<typeof console.groupCollapsed>;
  groupEnd: jest.SpiedFunction<typeof console.groupEnd>;
}

function spyOnConsole(): ConsoleSpies {
  const { console: c } = globalThis;
  return {
    log: jest.spyOn(c, 'log').mockImplementation(() => undefined),
    warn: jest.spyOn(c, 'warn').mockImplementation(() => undefined),
    error: jest.spyOn(c, 'error').mockImplementation(() => undefined),
    group: jest.spyOn(c, 'groupCollapsed').mockImplementation(() => undefined),
    groupEnd: jest.spyOn(c, 'groupEnd').mockImplementation(() => undefined),
  };
}

function calls(spy: jest.SpiedFunction<typeof console.log>): string {
  return spy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
}

describe('sendOperationsDebugged', () => {
  let spies: ConsoleSpies;

  beforeEach(() => {
    spies = spyOnConsole();
    sendOperationsMock.mockReset();
    fetchGraphOrAgentConfigMock.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the local state before saving and the exact ops payload', async () => {
    sendOperationsMock.mockResolvedValue(undefined);
    fetchGraphOrAgentConfigMock.mockResolvedValue({ ...localState, startNode: 'start', agents: [] });

    await sendOperationsDebugged(
      AGENT_ID,
      ops,
      () => localState,
      () => 0
    );

    expect(calls(spies.group)).toContain('SAVING 2 ops');
    expect(calls(spies.group)).toContain('insertNode a');
    expect(calls(spies.group)).toContain('insertEdge start->a');
  });

  it('describes update/delete and non-graph ops in the batch header', async () => {
    sendOperationsMock.mockResolvedValue(undefined);
    fetchGraphOrAgentConfigMock.mockResolvedValue({ appType: 'agent' });
    const mixedOps: Operation[] = [
      { type: 'updateNode', data: { nodeId: 'a', text: 't', kind: 'agent' } },
      { type: 'deleteNode', nodeId: 'b' },
      { type: 'updateEdge', data: { from: 'a', to: 'b' } },
      { type: 'deleteEdge', from: 'b', to: 'c' },
      { type: 'updateStartNode', startNode: 'a' },
    ];

    await sendOperationsDebugged(
      AGENT_ID,
      mixedOps,
      () => localState,
      () => 0
    );

    const header = calls(spies.group);
    expect(header).toContain('updateNode a');
    expect(header).toContain('deleteNode b');
    expect(header).toContain('updateEdge a->b');
    expect(header).toContain('deleteEdge b->c');
    expect(header).toContain('updateStartNode');
  });

  it('logs the local state summary and the exact ops payload before sending', async () => {
    sendOperationsMock.mockResolvedValue(undefined);
    fetchGraphOrAgentConfigMock.mockResolvedValue({ ...localState, startNode: 'start', agents: [] });

    await sendOperationsDebugged(
      AGENT_ID,
      ops,
      () => localState,
      () => 0
    );

    expect(calls(spies.log)).toContain('local state BEFORE save: 2 nodes, 1 edges');
    const payloadCall = spies.log.mock.calls.find((args) => String(args[0]).includes('operations payload'));
    expect(payloadCall?.[1]).toEqual(ops);
    expect(sendOperationsMock).toHaveBeenCalledWith(AGENT_ID, ops);
  });

  it('re-fetches the server graph after save and reports IN SYNC when states match', async () => {
    sendOperationsMock.mockResolvedValue(undefined);
    fetchGraphOrAgentConfigMock.mockResolvedValue({ ...localState, startNode: 'start', agents: [] });

    await sendOperationsDebugged(
      AGENT_ID,
      ops,
      () => localState,
      () => 0
    );

    expect(fetchGraphOrAgentConfigMock).toHaveBeenCalledWith(AGENT_ID);
    expect(calls(spies.log)).toContain('IN SYNC');
    expect(spies.warn).not.toHaveBeenCalled();
  });

  it('warns with a diff (and DATA LOSS marker) when the server is missing edges and no ops are pending', async () => {
    sendOperationsMock.mockResolvedValue(undefined);
    const serverState = graphState([], ['start', 'a']);
    fetchGraphOrAgentConfigMock.mockResolvedValue({ ...serverState, startNode: 'start', agents: [] });

    await sendOperationsDebugged(
      AGENT_ID,
      ops,
      () => localState,
      () => 0
    );

    const warned = calls(spies.warn);
    expect(warned).toContain('DIVERGE');
    expect(warned).toContain('REAL DATA LOSS');
    const diffArg = spies.warn.mock.calls[0]?.[1] as { edgesMissingOnServer: string[] };
    expect(diffArg.edgesMissingOnServer).toEqual(['start->a']);
  });

  it('softens the divergence warning while ops are still pending', async () => {
    sendOperationsMock.mockResolvedValue(undefined);
    fetchGraphOrAgentConfigMock.mockResolvedValue({
      ...graphState([], ['start']),
      startNode: 'start',
      agents: [],
    });

    await sendOperationsDebugged(
      AGENT_ID,
      ops,
      () => localState,
      () => 3
    );

    expect(calls(spies.warn)).toContain('3 ops still pending');
  });

  it('reports precondition count mismatches on shared edges', async () => {
    sendOperationsMock.mockResolvedValue(undefined);
    const serverState = graphState([{ from: 'start', to: 'a', preconditions: [] }], ['start', 'a']);
    fetchGraphOrAgentConfigMock.mockResolvedValue({ ...serverState, startNode: 'start', agents: [] });

    await sendOperationsDebugged(
      AGENT_ID,
      ops,
      () => localState,
      () => 0
    );

    const diffArg = spies.warn.mock.calls[0]?.[1] as { preconditionCountMismatches: string[] };
    expect(diffArg.preconditionCountMismatches[0]).toContain('start->a');
  });

  it('skips the diff for agent-mode configs', async () => {
    sendOperationsMock.mockResolvedValue(undefined);
    fetchGraphOrAgentConfigMock.mockResolvedValue({ appType: 'agent' });

    await sendOperationsDebugged(
      AGENT_ID,
      ops,
      () => localState,
      () => 0
    );

    expect(calls(spies.log)).toContain('agent-mode config');
    expect(spies.warn).not.toHaveBeenCalled();
  });

  it('logs and rethrows on send failure without fetching the server state', async () => {
    sendOperationsMock.mockRejectedValue(new Error('http 500'));

    await expect(
      sendOperationsDebugged(
        AGENT_ID,
        ops,
        () => localState,
        () => 0
      )
    ).rejects.toThrow('http 500');

    expect(calls(spies.error)).toContain('SAVE FAILED');
    expect(calls(spies.error)).toContain('requeued');
    expect(fetchGraphOrAgentConfigMock).not.toHaveBeenCalled();
  });

  it('warns but resolves when the post-save verification fetch fails', async () => {
    sendOperationsMock.mockResolvedValue(undefined);
    fetchGraphOrAgentConfigMock.mockRejectedValue(new Error('fetch down'));

    await expect(
      sendOperationsDebugged(
        AGENT_ID,
        ops,
        () => localState,
        () => 0
      )
    ).resolves.toBeUndefined();
    expect(calls(spies.warn)).toContain('verification fetch failed');
  });

  it('warns when the local state is unavailable and skips the diff', async () => {
    sendOperationsMock.mockResolvedValue(undefined);
    fetchGraphOrAgentConfigMock.mockResolvedValue({
      ...graphState([], []),
      startNode: 'start',
      agents: [],
    });

    await sendOperationsDebugged(
      AGENT_ID,
      ops,
      () => null,
      () => 0
    );

    expect(calls(spies.warn)).toContain('unavailable');
    expect(calls(spies.warn)).not.toContain('DIVERGE');
  });
});
