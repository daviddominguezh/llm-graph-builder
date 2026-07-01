import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SimChildDispatchedEvent } from '../../lib/sseSimComposition';
import { DEFAULT_PRESET } from '../../types/preset';
import { CompositionStore } from '../compositionStore';
import type { GraphSnapshot, SendMessageDeps, SimulationSetters } from '../useSimulationHelpers';

/* ─── Mock the single stream fn (the sole side-effecting call) ─── */

interface CapturedBody {
  appType?: string;
}

const streamSimulationMock = jest.fn<(body: CapturedBody, cb: unknown, signal?: unknown) => Promise<void>>(
  () => Promise.resolve()
);

jest.unstable_mockModule('../../lib/simulationApi.js', () => ({
  streamSimulation: streamSimulationMock,
}));

const { sendSim } = await import('../simulationSendHelpers.js');

/* ─── Test builders ─── */

function makeSetters(snapshot: GraphSnapshot | null): SimulationSetters {
  return {
    setMessages: jest.fn(),
    setNodeResults: jest.fn(),
    setLastUserText: jest.fn(),
    setTotalTokens: jest.fn(),
    setCurrentNode: jest.fn(),
    setVisitedNodes: jest.fn(),
    setLoading: jest.fn(),
    setStructuredOutputs: jest.fn(),
    setConversationEntries: jest.fn(),
    setTurnCount: jest.fn(),
    saveSnapshot: jest.fn(),
    getSnapshot: () => snapshot,
    setSimulationLeadScore: jest.fn(),
  } as unknown as SimulationSetters;
}

function makeDeps(overrides: Partial<SendMessageDeps>): SendMessageDeps {
  const snapshot: GraphSnapshot = { nodes: [], edges: [] };
  return {
    preset: DEFAULT_PRESET,
    loading: false,
    messages: [],
    agents: [],
    apiKeyId: 'key-1',
    modelId: 'model-1',
    currentNode: 'INITIAL_STEP',
    mcpServers: [],
    outputSchemas: [],
    structuredOutputs: {},
    setters: makeSetters(snapshot),
    onZoomToNode: jest.fn(),
    onSelectNode: jest.fn(),
    ...overrides,
  };
}

const AGENT_CONFIG = { systemPrompt: 'you are helpful', maxSteps: 5, contextItems: [], skills: [] };

function dispatchChild(store: CompositionStore): void {
  store.dispatch({ type: 'START', rootMessages: [] });
  const event: SimChildDispatchedEvent = {
    depth: 1,
    parentDepth: 0,
    dispatchType: 'invoke_agent',
    task: 'child task',
    parentToolCallId: 'tc-1',
    toolName: 'invoke_agent',
  };
  store.dispatch({ type: 'CHILD_DISPATCHED', event, parentMessages: [], parentCurrentNode: 'n1' });
}

function firstBody(): CapturedBody | undefined {
  return streamSimulationMock.mock.calls[0]?.[0];
}

/* ─── Tests ─── */

describe('sendSim — one stream fn, appType reports the engine', () => {
  beforeEach(() => {
    streamSimulationMock.mockClear();
  });

  it('agent deps → exactly one streamSimulation with appType "agent"', () => {
    const store = new CompositionStore();
    const deps = makeDeps({ appType: 'agent', agentConfig: AGENT_CONFIG });

    sendSim(deps, store, new AbortController().signal, 'hi');

    expect(streamSimulationMock).toHaveBeenCalledTimes(1);
    expect(firstBody()?.appType).toBe('agent');
  });

  it('workflow deps → exactly one streamSimulation with appType "workflow"', () => {
    const store = new CompositionStore();
    const deps = makeDeps({ appType: 'workflow' });

    sendSim(deps, store, new AbortController().signal, 'hi');

    expect(streamSimulationMock).toHaveBeenCalledTimes(1);
    expect(firstBody()?.appType).toBe('workflow');
  });

  it('child active overrides deps.appType → routes agent body (appType "agent")', () => {
    const store = new CompositionStore();
    dispatchChild(store);
    // Even though deps say workflow, an active child forces the agent engine.
    const deps = makeDeps({ appType: 'workflow', agentConfig: AGENT_CONFIG });

    sendSim(deps, store, new AbortController().signal, 'child follow-up', true);

    expect(streamSimulationMock).toHaveBeenCalledTimes(1);
    expect(firstBody()?.appType).toBe('agent');
  });
});
