'use client';

import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { MESSAGES_PROVIDER, type Message } from '@daviddh/llm-graph-runner';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { streamAgentSimulation } from '../lib/agentSimulationApi';
import { streamSimulation } from '../lib/api';
import type { Agent, McpServerConfig } from '../schemas/graph.schema';
import type { ContextPreset } from '../types/preset';
import type { ConversationEntry, NodeResult, SimulationTokens } from '../types/simulation';
import { START_NODE_ID } from '../utils/graphContext';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import type {
  FullSetters,
  GraphSnapshot,
  SendMessageDeps,
  SimulationSetters,
  SimulationStartDeps,
} from './useSimulationHelpers';
import { buildAgentSimulateParams, buildSimulateParams, buildStreamCallbacks } from './useSimulationHelpers';
import {
  EMPTY_TOKENS,
  type SimulationHookState,
  useAbortRef,
  useSimulationState,
} from './useSimulationState';

const ZERO_EDGES = 0;

function isNodeTerminal(edges: Array<RFEdge<RFEdgeData>>, nodeId: string): boolean {
  return nodeId !== START_NODE_ID && edges.filter((e) => e.source === nodeId).length === ZERO_EDGES;
}

interface AgentSimConfig {
  systemPrompt: string;
  maxSteps: number | null;
  contextItems: Array<{ sortOrder: number; content: string }>;
}

interface UseSimulationParams {
  allNodes: Array<RFNode<RFNodeData>>;
  edges: Array<RFEdge<RFEdgeData>>;
  agents: Agent[];
  preset: ContextPreset | undefined;
  apiKeyId: string;
  mcpServers: McpServerConfig[];
  outputSchemas: OutputSchemaEntity[];
  onZoomToNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onExitZoomView: () => void;
  appType?: 'workflow' | 'agent';
  agentConfig?: AgentSimConfig;
}

export interface SimulationState {
  active: boolean;
  loading: boolean;
  currentNode: string;
  terminated: boolean;
  visitedNodes: string[];
  lastUserText: string;
  nodeResults: NodeResult[];
  conversationEntries: ConversationEntry[];
  totalTokens: SimulationTokens;
  modelId: string;
  setModelId: (id: string) => void;
  start: () => void;
  stop: () => void;
  sendMessage: (text: string) => void;
}

function createUserMessage(text: string): Message {
  return {
    id: nanoid(),
    provider: MESSAGES_PROVIDER.WEB,
    type: 'text',
    timestamp: Date.now(),
    originalId: nanoid(),
    message: { role: 'user', content: [{ type: 'text', text }] },
  };
}

function useSimulationStart(deps: SimulationStartDeps & { appType?: string }): () => void {
  const { setters, allNodes, edges, onZoomToNode, appType } = deps;

  return useCallback(() => {
    setters.saveSnapshot({ nodes: [...allNodes], edges: [...edges] });
    setters.setActive(true);
    setters.setCurrentNode(appType === 'agent' ? 'agent' : START_NODE_ID);
    setters.setMessages([]);
    setters.setNodeResults([]);
    setters.setLastUserText('');
    setters.setVisitedNodes([]);
    setters.setTotalTokens(EMPTY_TOKENS);
    setters.setStructuredOutputs({});
    if (appType !== 'agent') {
      onZoomToNode(START_NODE_ID);
    }
  }, [setters, allNodes, edges, onZoomToNode, appType]);
}

function useSimulationStop(
  setters: FullSetters,
  abortSimulation: () => void,
  onExitZoomView: () => void
): () => void {
  return useCallback(() => {
    abortSimulation();
    setters.saveSnapshot(null);
    setters.setActive(false);
    setters.setMessages([]);
    setters.setNodeResults([]);
    setters.setLastUserText('');
    setters.setVisitedNodes([]);
    setters.setTotalTokens(EMPTY_TOKENS);
    setters.setStructuredOutputs({});
    onExitZoomView();
  }, [setters, abortSimulation, onExitZoomView]);
}

function checkTerminated(
  active: boolean,
  loading: boolean,
  snapshot: GraphSnapshot | null,
  currentNode: string
): boolean {
  return active && !loading && snapshot !== null && isNodeTerminal(snapshot.edges, currentNode);
}

function resetBeforeSend(setters: SimulationSetters, text: string, userMsg: Message): void {
  setters.setLoading(true);
  setters.setLastUserText(text);
  setters.setMessages((prev) => [...prev, userMsg]);
  setters.setConversationEntries((prev) => [...prev, { type: 'user' as const, text }]);
}

interface SendDepsWithAbort extends SendMessageDeps {
  abortAndCreateSignal: () => AbortSignal;
}

function sendAgentSimulation(deps: SendDepsWithAbort, text: string): void {
  const { agentConfig, mcpServers, apiKeyId, modelId, messages, setters } = deps;
  const { abortAndCreateSignal, onZoomToNode, onSelectNode } = deps;
  if (agentConfig === undefined) return;
  const signal = abortAndCreateSignal();
  const userMsg = createUserMessage(text);
  const allMessages = [...messages, userMsg];
  console.log('[simulation] sending agent messages:', allMessages.length, allMessages.map((m) => m.message.role));
  resetBeforeSend(setters, text, userMsg);
  const params = buildAgentSimulateParams({ agentConfig, mcpServers, allMessages, apiKeyId, modelId });
  const callbacks = buildStreamCallbacks({ setters, onZoomToNode, onSelectNode });
  void streamAgentSimulation(params, callbacks, signal).catch((err: unknown) => {
    setters.setLoading(false);
    toast.error(err instanceof Error ? err.message : 'Simulation failed');
  });
}

function sendWorkflowSimulation(deps: SendDepsWithAbort, text: string): void {
  const { preset, messages, agents, mcpServers, outputSchemas, currentNode } = deps;
  const { apiKeyId, modelId, structuredOutputs, setters, onZoomToNode, onSelectNode } = deps;
  const { abortAndCreateSignal } = deps;
  const snapshot = setters.getSnapshot();
  if (preset === undefined || snapshot === null) return;
  const signal = abortAndCreateSignal();
  const userMsg = createUserMessage(text);
  const allMessages = [...messages, userMsg];
  resetBeforeSend(setters, text, userMsg);
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
  });
  const callbacks = buildStreamCallbacks({ setters, onZoomToNode, onSelectNode });
  void streamSimulation(params, callbacks, signal).catch((err: unknown) => {
    setters.setLoading(false);
    toast.error(err instanceof Error ? err.message : 'Simulation failed');
  });
}

function useSimulationSend(deps: SendDepsWithAbort): (text: string) => void {
  const { loading, appType } = deps;

  return useCallback(
    (text: string) => {
      if (loading) return;
      if (appType === 'agent') {
        sendAgentSimulation(deps, text);
        return;
      }
      sendWorkflowSimulation(deps, text);
    },
    [deps, loading, appType]
  );
}

function buildSendDeps(
  params: UseSimulationParams,
  s: SimulationHookState,
  abortAndCreateSignal: () => AbortSignal
): SendDepsWithAbort {
  return {
    preset: params.preset,
    loading: s.loading,
    messages: s.messages,
    agents: params.agents,
    apiKeyId: params.apiKeyId,
    modelId: s.modelId,
    currentNode: s.currentNode,
    mcpServers: params.mcpServers,
    outputSchemas: params.outputSchemas,
    structuredOutputs: s.structuredOutputs,
    setters: s.setters,
    onZoomToNode: params.onZoomToNode,
    onSelectNode: params.onSelectNode,
    appType: params.appType,
    agentConfig: params.agentConfig,
    abortAndCreateSignal,
  };
}

export function useSimulation(params: UseSimulationParams): SimulationState {
  const { allNodes, edges, onZoomToNode, onExitZoomView } = params;
  const s = useSimulationState();
  const { abortSimulation, abortAndCreateSignal } = useAbortRef();

  const start = useSimulationStart({
    setters: s.setters,
    allNodes,
    edges,
    onZoomToNode,
    appType: params.appType,
  });
  const stop = useSimulationStop(s.setters, abortSimulation, onExitZoomView);
  const sendMessage = useSimulationSend(buildSendDeps(params, s, abortAndCreateSignal));
  const isAgent = params.appType === 'agent';
  const terminated = isAgent ? false : checkTerminated(s.active, s.loading, s.snapshotRef.current, s.currentNode);

  return {
    active: s.active,
    loading: s.loading,
    currentNode: s.currentNode,
    terminated,
    visitedNodes: s.visitedNodes,
    lastUserText: s.lastUserText,
    nodeResults: s.nodeResults,
    conversationEntries: s.conversationEntries,
    totalTokens: s.totalTokens,
    modelId: s.modelId,
    setModelId: s.setModelId,
    start,
    stop,
    sendMessage,
  };
}
