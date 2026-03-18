import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { MESSAGES_PROVIDER, type Message } from '@daviddh/llm-graph-runner';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback, useRef, useState } from 'react';

import { streamSimulation } from '../lib/api';
import type { Agent, McpServerConfig } from '../schemas/graph.schema';
import type { ContextPreset } from '../types/preset';
import type { NodeResult, SimulationTokens } from '../types/simulation';
import { START_NODE_ID } from '../utils/graphContext';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import type {
  FullSetters,
  GraphSnapshot,
  SendMessageDeps,
  SimulationSetters,
  SimulationStartDeps,
} from './useSimulationHelpers';
import { buildSimulateParams, buildStreamCallbacks } from './useSimulationHelpers';

const INITIAL_TOKEN_COUNT = 0;
const ZERO_EDGES = 0;

function isNodeTerminal(edges: Array<RFEdge<RFEdgeData>>, nodeId: string): boolean {
  return nodeId !== START_NODE_ID && edges.filter((e) => e.source === nodeId).length === ZERO_EDGES;
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
}

export interface SimulationState {
  active: boolean;
  loading: boolean;
  currentNode: string;
  terminated: boolean;
  visitedNodes: string[];
  lastUserText: string;
  nodeResults: NodeResult[];
  totalTokens: SimulationTokens;
  modelId: string;
  setModelId: (id: string) => void;
  start: () => void;
  stop: () => void;
  sendMessage: (text: string) => void;
}

const EMPTY_TOKENS: SimulationTokens = {
  input: INITIAL_TOKEN_COUNT,
  output: INITIAL_TOKEN_COUNT,
  cached: INITIAL_TOKEN_COUNT,
};

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

function useSimulationStart(deps: SimulationStartDeps): () => void {
  const { setters, allNodes, edges, onZoomToNode } = deps;

  return useCallback(() => {
    setters.saveSnapshot({ nodes: [...allNodes], edges: [...edges] });
    setters.setActive(true);
    setters.setCurrentNode(START_NODE_ID);
    setters.setMessages([]);
    setters.setNodeResults([]);
    setters.setLastUserText('');
    setters.setVisitedNodes([]);
    setters.setTotalTokens(EMPTY_TOKENS);
    setters.setStructuredOutputs({});
    onZoomToNode(START_NODE_ID);
  }, [setters, allNodes, edges, onZoomToNode]);
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

function resetBeforeSend(setters: SimulationSetters, text: string): void {
  setters.setLoading(true);
  setters.setNodeResults([]);
  setters.setLastUserText(text);
  setters.setVisitedNodes([]);
}

interface SendDepsWithAbort extends SendMessageDeps {
  abortAndCreateSignal: () => AbortSignal;
}

function useSimulationSend(deps: SendDepsWithAbort): (text: string) => void {
  const { preset, loading, messages, agents, apiKeyId, modelId, currentNode } = deps;
  const { mcpServers, outputSchemas, structuredOutputs, setters, onZoomToNode, onSelectNode } = deps;
  const { abortAndCreateSignal } = deps;

  return useCallback(
    (text: string) => {
      const snapshot = setters.getSnapshot();
      if (preset === undefined || loading || snapshot === null) return;
      const signal = abortAndCreateSignal();
      resetBeforeSend(setters, text);
      const allMessages = [...messages, createUserMessage(text)];
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
      void streamSimulation(params, callbacks, signal).catch(() => {
        setters.setLoading(false);
      });
    },
    [
      preset,
      loading,
      messages,
      agents,
      apiKeyId,
      modelId,
      currentNode,
      mcpServers,
      outputSchemas,
      structuredOutputs,
      setters,
      onZoomToNode,
      onSelectNode,
      abortAndCreateSignal,
    ]
  );
}

interface SimulationHookState {
  active: boolean;
  loading: boolean;
  currentNode: string;
  messages: Message[];
  lastUserText: string;
  nodeResults: NodeResult[];
  visitedNodes: string[];
  totalTokens: SimulationTokens;
  structuredOutputs: Record<string, unknown[]>;
  modelId: string;
  setModelId: React.Dispatch<React.SetStateAction<string>>;
  snapshotRef: React.RefObject<GraphSnapshot | null>;
  setters: FullSetters;
}

function useSnapshotRef(): {
  snapshotRef: React.RefObject<GraphSnapshot | null>;
  saveSnapshot: (s: GraphSnapshot | null) => void;
  getSnapshot: () => GraphSnapshot | null;
} {
  const snapshotRef = useRef<GraphSnapshot | null>(null);
  const saveSnapshot = useCallback((s: GraphSnapshot | null) => {
    snapshotRef.current = s;
  }, []);
  const getSnapshot = useCallback((): GraphSnapshot | null => snapshotRef.current, []);
  return { snapshotRef, saveSnapshot, getSnapshot };
}

function useAbortRef(): {
  abortSimulation: () => void;
  abortAndCreateSignal: () => AbortSignal;
} {
  const abortRef = useRef<AbortController | null>(null);
  const abortSimulation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);
  const abortAndCreateSignal = useCallback((): AbortSignal => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller.signal;
  }, []);
  return { abortSimulation, abortAndCreateSignal };
}

function useSimulationState(): SimulationHookState {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentNode, setCurrentNode] = useState(START_NODE_ID);
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastUserText, setLastUserText] = useState('');
  const [nodeResults, setNodeResults] = useState<NodeResult[]>([]);
  const [visitedNodes, setVisitedNodes] = useState<string[]>([]);
  const [totalTokens, setTotalTokens] = useState<SimulationTokens>(EMPTY_TOKENS);
  const [structuredOutputs, setStructuredOutputs] = useState<Record<string, unknown[]>>({});
  const [modelId, setModelId] = useState('x-ai/grok-4.1-fast');
  const { snapshotRef, saveSnapshot, getSnapshot } = useSnapshotRef();

  const setters: FullSetters = {
    setMessages,
    setNodeResults,
    setLastUserText,
    setTotalTokens,
    setCurrentNode,
    setVisitedNodes,
    setLoading,
    setStructuredOutputs,
    setActive,
    saveSnapshot,
    getSnapshot,
  };

  return {
    active,
    loading,
    currentNode,
    messages,
    lastUserText,
    nodeResults,
    visitedNodes,
    totalTokens,
    structuredOutputs,
    modelId,
    setModelId,
    snapshotRef,
    setters,
  };
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
    abortAndCreateSignal,
  };
}

export function useSimulation(params: UseSimulationParams): SimulationState {
  const { allNodes, edges, onZoomToNode, onExitZoomView } = params;
  const s = useSimulationState();
  const { abortSimulation, abortAndCreateSignal } = useAbortRef();

  const start = useSimulationStart({ setters: s.setters, allNodes, edges, onZoomToNode });
  const stop = useSimulationStop(s.setters, abortSimulation, onExitZoomView);
  const sendMessage = useSimulationSend(buildSendDeps(params, s, abortAndCreateSignal));
  const terminated = checkTerminated(s.active, s.loading, s.snapshotRef.current, s.currentNode);

  return {
    active: s.active,
    loading: s.loading,
    currentNode: s.currentNode,
    terminated,
    visitedNodes: s.visitedNodes,
    lastUserText: s.lastUserText,
    nodeResults: s.nodeResults,
    totalTokens: s.totalTokens,
    modelId: s.modelId,
    setModelId: s.setModelId,
    start,
    stop,
    sendMessage,
  };
}
