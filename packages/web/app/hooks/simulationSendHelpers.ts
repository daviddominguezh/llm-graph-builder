import type { Message } from '@daviddh/llm-graph-runner';
import { toast } from 'sonner';

import type { AgentSimulateRequestBody } from '../lib/agentSimulationApi';
import type { StreamCallbacks } from '../lib/api';
import type { SimulationRequestBody } from '../lib/simulationApi';
import { streamSimulation } from '../lib/simulationApi';
import { createUserMessage } from './compositionStackHelpers';
import type { CompositionStore } from './compositionStore';
import {
  type CompositionLevel,
  buildCompositionPayload,
  getActiveDepth,
  getActiveMessages,
} from './useCompositionStack';
import type { AgentSimConfig, SendMessageDeps, SimulationSetters } from './useSimulationHelpers';
import { buildAgentSimulateParams, buildSimulateParams, buildStreamCallbacks } from './useSimulationHelpers';

/* ─── Types ─── */

export interface CompositionRequestOverrides {
  messages: Message[];
  composition: NonNullable<AgentSimulateRequestBody['composition']>;
  orgId?: string;
}

/* ─── Request Overrides ─── */

function getCompositionRequestOverrides(
  stack: CompositionLevel[],
  rootMessages: Message[]
): CompositionRequestOverrides | undefined {
  const depth = getActiveDepth(stack);
  if (depth === 0) return undefined;
  const activeMessages = getActiveMessages(stack, rootMessages);
  const composition = buildCompositionPayload(stack);
  if (composition === undefined) return undefined;
  return { messages: activeMessages, composition };
}

/* ─── Callback Builder ─── */

// Route T17 sim-state bridge events to the T19 store. The runtime is the sole
// authoritative writer: snapshots replace the whole copy, patches are display-only.
function buildStateCallbacks(deps: SendMessageDeps): Pick<StreamCallbacks, 'onStateSnapshot' | 'onStatePatch'> {
  return {
    onStateSnapshot: (state) => deps.adoptSnapshot?.(state),
    onStatePatch: (path, value) => deps.applyStatePatch?.(path, value),
  };
}

export function buildMergedCallbacks(deps: SendMessageDeps, store: CompositionStore): StreamCallbacks {
  const base = buildStreamCallbacks(deps);
  const baseOnComplete = base.onComplete;
  let lastResponseText = '';
  let lastVisitedNode = deps.currentNode;
  const baseOnNodeProcessed = base.onNodeProcessed;

  const baseOnNodeVisited = base.onNodeVisited;
  base.onNodeVisited = (nodeId: string) => {
    lastVisitedNode = nodeId; // Always track synchronously for dispatch
    const snap = store.getSnapshot();
    if (snap.stack.length > 0 || deps.appType === 'agent') {
      // Agent mode or child active: track visited nodes but keep currentNode as "Turn N"
      deps.setters.setVisitedNodes((prev) => [...prev, nodeId]);
      return;
    }
    baseOnNodeVisited?.(nodeId);
  };
  base.onNodeProcessed = (event) => {
    baseOnNodeProcessed?.(event);
    if (event.text !== undefined && event.text !== '') {
      lastResponseText = event.text;
    }
  };

  return {
    ...base,
    ...buildStateCallbacks(deps),
    onSimChildDispatched: (event) => {
      const snap = store.getSnapshot();
      store.dispatch({
        type: 'CHILD_DISPATCHED',
        event,
        parentMessages: snap.rootMessages,
        parentCurrentNode: lastVisitedNode,
      });
    },
    onSimChildFinished: (event) => {
      const status = event.status === 'error' ? 'error' : 'success';
      deps.setters.setConversationEntries((prev) => [...prev, { type: 'child_end', label: event.status }]);
      store.dispatch({ type: 'CHILD_FINISHED', output: event.output, status });
    },
    onSimChildWaiting: () => {
      deps.setters.setLoading(false);
    },
    onComplete: () => {
      const snap = store.getSnapshot();
      if (snap.stack.length > 0 && snap.pendingDispatch === null) {
        deps.setters.setLoading(false);
        if (lastResponseText !== '') {
          store.dispatch({ type: 'CHILD_RESPONSE', text: lastResponseText });
        }
      } else {
        baseOnComplete?.();
        if (lastResponseText !== '') {
          store.dispatch({ type: 'ASSISTANT_RESPONSE', text: lastResponseText });
        }
      }
      store.dispatch({ type: 'STREAM_COMPLETED' });
    },
  };
}

/* ─── Agent Config Resolution ─── */

function resolveAgentConfig(deps: SendMessageDeps, stack: CompositionLevel[]): AgentSimConfig | undefined {
  const activeChild = stack.length > 0 ? stack[stack.length - 1] : undefined;
  return (
    deps.agentConfig ??
    (activeChild?.childConfig !== undefined
      ? {
          systemPrompt: activeChild.childConfig.systemPrompt,
          maxSteps: activeChild.childConfig.maxSteps,
          contextItems: [],
          skills: [],
        }
      : undefined)
  );
}

function resolveModelId(deps: SendMessageDeps, stack: CompositionLevel[]): string {
  const activeChild = stack.length > 0 ? stack[stack.length - 1] : undefined;
  if (activeChild?.childConfig?.modelId !== undefined && activeChild.childConfig.modelId !== '') {
    return activeChild.childConfig.modelId;
  }
  return deps.modelId;
}

function buildAgentParams(
  deps: SendMessageDeps,
  store: CompositionStore,
  allMessages: Message[]
): AgentSimulateRequestBody | undefined {
  const snap = store.getSnapshot();
  const agentConfig = resolveAgentConfig(deps, snap.stack);
  if (agentConfig === undefined) return undefined;
  const modelId = resolveModelId(deps, snap.stack);
  const params = buildAgentSimulateParams({
    agentConfig,
    mcpServers: deps.mcpServers,
    allMessages,
    apiKeyId: deps.apiKeyId,
    modelId,
  });
  const overrides = getCompositionRequestOverrides(snap.stack, snap.rootMessages);
  if (overrides !== undefined) {
    params.messages = overrides.messages;
    params.composition = overrides.composition;
    params.orgId = overrides.orgId;
  }
  return params;
}

/* ─── Stream Runner ─── */

// One place that calls the single `streamSimulation`. Both engines flow through
// here; the backend routes by `body.appType`.
function runSimStream(
  body: SimulationRequestBody,
  deps: SendMessageDeps,
  store: CompositionStore,
  signal: AbortSignal
): void {
  const callbacks = buildMergedCallbacks(deps, store);
  void streamSimulation(body, callbacks, signal).catch((err: unknown) => {
    deps.setters.setLoading(false);
    toast.error(err instanceof Error ? err.message : 'Simulation failed');
  });
}

/* ─── Senders ─── */

function buildAgentBody(
  deps: SendMessageDeps,
  store: CompositionStore,
  text: string,
  skipUserMessage: boolean
): AgentSimulateRequestBody | undefined {
  if (!skipUserMessage) store.dispatch({ type: 'USER_MESSAGE', text });
  resetBeforeSendAgent(deps.setters, text);
  const snap = store.getSnapshot();
  const allMessages = getActiveMessages(snap.stack, snap.rootMessages);
  return buildAgentParams(deps, store, allMessages);
}

function buildWorkflowBody(
  deps: SendMessageDeps,
  store: CompositionStore,
  text: string
): SimulationRequestBody | undefined {
  const { preset, messages, agents, mcpServers, outputSchemas, currentNode } = deps;
  const { apiKeyId, modelId, structuredOutputs, setters } = deps;
  const snapshot = setters.getSnapshot();
  if (preset === undefined || snapshot === null) return undefined;
  const userMsg = createUserMessage(text);
  const allMessages = [...messages, userMsg];
  resetBeforeSend(setters, text, userMsg);
  store.dispatch({ type: 'START', rootMessages: allMessages });
  const params = buildSimulateParams({
    snapshot,
    agents,
    mcpServers,
    outputSchemas,
    allMessages,
    currentNode,
    preset,
    apiKeyId,
    modelId,
    structuredOutputs,
    orgId: deps.orgId,
    simulationLeadScore: deps.simulationLeadScore,
  });
  return { ...params, appType: 'workflow' };
}

// Single entry point: builds the appropriate body then calls the one stream fn.
// No endpoint choice — agent vs workflow is reported via `appType`, not routed.
export function sendSim(
  deps: SendMessageDeps,
  store: CompositionStore,
  signal: AbortSignal,
  text: string,
  skipUserMessage = false
): void {
  const isChildActive = store.getSnapshot().stack.length > 0;
  const body =
    deps.appType === 'agent' || isChildActive
      ? buildAgentBody(deps, store, text, skipUserMessage)
      : buildWorkflowBody(deps, store, text);
  if (body === undefined) return;
  runSimStream(body, deps, store, signal);
}

/* ─── Before-send Helpers ─── */

const TURN_INCREMENT = 1;

function resetBeforeSend(setters: SimulationSetters, text: string, userMsg: Message): void {
  setters.setLoading(true);
  setters.setLastUserText(text);
  setters.setMessages((prev) => [...prev, userMsg]);
  setters.setConversationEntries((prev) => [...prev, { type: 'user' as const, text }]);
  // Workflows don't use turnCount — only agents display turns
}

function resetBeforeSendAgent(setters: SimulationSetters, text: string): void {
  setters.setLoading(true);
  setters.setLastUserText(text);
  setters.setConversationEntries((prev) => [...prev, { type: 'user' as const, text }]);
  setters.setTurnCount((prev) => {
    const next = prev + TURN_INCREMENT;
    setters.setCurrentNode(`Turn ${String(next)}`);
    return next;
  });
}
