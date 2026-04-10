'use client';

import type { OutputSchemaEntity } from '@daviddh/graph-types';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { Agent, McpServerConfig } from '../schemas/graph.schema';
import type { ContextPreset } from '../types/preset';
import type { ConversationEntry, NodeResult, SimulationTokens } from '../types/simulation';
import { START_NODE_ID } from '../utils/graphContext';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import type { CompositionPhase } from './compositionMachine';
import { CompositionStore } from './compositionStore';
import type {
  AgentSimConfig,
  FullSetters,
  GraphSnapshot,
  SendMessageDeps,
  SimulationStartDeps,
} from './useSimulationHelpers';
import { useAutoDispatchChild, useAutoResumeParent, useSimulationSend } from './useSimulationSend';
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

export interface UseSimulationParams {
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
  orgId?: string;
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
  turnCount: number;
  isAgent: boolean;
  compositionPhase: CompositionPhase;
  modelId: string;
  setModelId: (id: string) => void;
  start: () => void;
  stop: () => void;
  clear: () => void;
  sendMessage: (text: string) => void;
}

function useSimulationStart(
  deps: SimulationStartDeps & { appType?: string },
  store: CompositionStore
): () => void {
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
    store.dispatch({ type: 'RESET' });
    if (appType !== 'agent') {
      onZoomToNode(START_NODE_ID);
    }
  }, [setters, allNodes, edges, onZoomToNode, appType, store]);
}

function useSimulationStop(
  setters: FullSetters,
  abortSimulation: () => void,
  onExitZoomView: () => void,
  clearSelection: () => void
): () => void {
  return useCallback(() => {
    abortSimulation();
    setters.setActive(false);
    clearSelection();
    onExitZoomView();
  }, [setters, abortSimulation, onExitZoomView, clearSelection]);
}

function useSimulationClear(
  setters: FullSetters,
  abortSimulation: () => void,
  onExitZoomView: () => void,
  store: CompositionStore
): () => void {
  return useCallback(() => {
    abortSimulation();
    setters.saveSnapshot(null);
    setters.setActive(false);
    setters.setMessages([]);
    setters.setNodeResults([]);
    setters.setConversationEntries([]);
    setters.setTurnCount(0);
    setters.setLastUserText('');
    setters.setVisitedNodes([]);
    setters.setTotalTokens(EMPTY_TOKENS);
    setters.setStructuredOutputs({});
    store.dispatch({ type: 'RESET' });
    onExitZoomView();
  }, [setters, abortSimulation, onExitZoomView, store]);
}

function checkTerminated(
  active: boolean,
  loading: boolean,
  snapshot: GraphSnapshot | null,
  currentNode: string
): boolean {
  return active && !loading && snapshot !== null && isNodeTerminal(snapshot.edges, currentNode);
}

function buildSendDeps(params: UseSimulationParams, s: SimulationHookState): SendMessageDeps {
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
    orgId: params.orgId,
    appType: params.appType,
    agentConfig: params.agentConfig,
  };
}

export function useSimulation(params: UseSimulationParams): SimulationState {
  const { allNodes, edges, onZoomToNode, onExitZoomView } = params;
  const s = useSimulationState();
  const { abortSimulation, abortAndCreateSignal } = useAbortRef();

  // Composition store (stable reference, never recreated)
  const [store] = useState(() => new CompositionStore());
  const comp = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const start = useSimulationStart(
    { setters: s.setters, allNodes, edges, onZoomToNode, appType: params.appType },
    store
  );
  const clearSelection = useCallback(() => {
    /* no-op, panels cleared by onPaneClick */
  }, []);
  const stop = useSimulationStop(s.setters, abortSimulation, onExitZoomView, clearSelection);
  const clear = useSimulationClear(s.setters, abortSimulation, onExitZoomView, store);

  const sendDeps = buildSendDeps(params, s);
  const sendDepsRef = useRef(sendDeps);
  useEffect(() => {
    sendDepsRef.current = sendDeps;
  });
  const sendMessage = useSimulationSend(sendDepsRef, store, abortAndCreateSignal);

  // Side effects: auto-dispatch child and auto-resume parent
  useAutoDispatchChild(store, sendDepsRef, comp.phase, abortAndCreateSignal);
  useAutoResumeParent(store, sendDepsRef, comp.phase, abortAndCreateSignal);

  const isAgent = params.appType === 'agent';
  const hasActiveChild = comp.stack.length > 0;
  const snapshot = s.setters.getSnapshot();
  const terminated =
    isAgent || hasActiveChild ? false : checkTerminated(s.active, s.loading, snapshot, s.currentNode);

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
    turnCount: s.turnCount,
    isAgent: params.appType === 'agent',
    compositionPhase: comp.phase,
    modelId: s.modelId,
    setModelId: s.setModelId,
    start,
    stop,
    clear,
    sendMessage,
  };
}
