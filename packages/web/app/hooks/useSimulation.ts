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
    onZoomToNode(START_NODE_ID);
  }, [setters, allNodes, edges, onZoomToNode]);
}

function useSimulationStop(
  setters: SimulationSetters & { setActive: React.Dispatch<React.SetStateAction<boolean>> },
  onExitZoomView: () => void
): () => void {
  return useCallback(() => {
    setters.saveSnapshot(null);
    setters.setActive(false);
    setters.setMessages([]);
    setters.setNodeResults([]);
    setters.setLastUserText('');
    setters.setVisitedNodes([]);
    setters.setTotalTokens(EMPTY_TOKENS);
    onExitZoomView();
  }, [setters, onExitZoomView]);
}

function checkTerminated(
  active: boolean,
  loading: boolean,
  snapshot: GraphSnapshot | null,
  currentNode: string
): boolean {
  return active && !loading && snapshot !== null && isNodeTerminal(snapshot.edges, currentNode);
}

function useSimulationSend(deps: SendMessageDeps): (text: string) => void {
  const { preset, loading, messages, agents, apiKeyId, currentNode, mcpServers } = deps;
  const { setters, onZoomToNode, onSelectNode } = deps;

  return useCallback(
    (text: string) => {
      const snapshot = setters.getSnapshot();
      if (preset === undefined || loading || snapshot === null) return;
      setters.setLoading(true);
      setters.setNodeResults([]);
      setters.setLastUserText(text);

      const userMessage = createUserMessage(text);
      const allMessages = [...messages, userMessage];
      const params = buildSimulateParams({
        snapshot,
        agents,
        mcpServers,
        allMessages,
        currentNode,
        preset,
        apiKeyId,
      });
      const callbacks = buildStreamCallbacks({ setters, onZoomToNode, onSelectNode });

      void streamSimulation(params, callbacks).catch(() => {
        setters.setLoading(false);
      });
    },
    [
      preset,
      loading,
      messages,
      agents,
      apiKeyId,
      currentNode,
      mcpServers,
      setters,
      onZoomToNode,
      onSelectNode,
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
  snapshotRef: React.RefObject<GraphSnapshot | null>;
  setters: FullSetters;
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
  const snapshotRef = useRef<GraphSnapshot | null>(null);
  const saveSnapshot = useCallback((s: GraphSnapshot | null) => {
    snapshotRef.current = s;
  }, []);
  const getSnapshot = useCallback((): GraphSnapshot | null => snapshotRef.current, []);

  const setters: FullSetters = {
    setMessages,
    setNodeResults,
    setLastUserText,
    setTotalTokens,
    setCurrentNode,
    setVisitedNodes,
    setLoading,
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
    snapshotRef,
    setters,
  };
}

export function useSimulation(params: UseSimulationParams): SimulationState {
  const {
    allNodes,
    edges,
    agents,
    preset,
    apiKeyId,
    mcpServers,
    onZoomToNode,
    onSelectNode,
    onExitZoomView,
  } = params;
  const s = useSimulationState();

  const start = useSimulationStart({ setters: s.setters, allNodes, edges, onZoomToNode });
  const stop = useSimulationStop(s.setters, onExitZoomView);
  const sendMessage = useSimulationSend({
    preset,
    loading: s.loading,
    messages: s.messages,
    agents,
    apiKeyId,
    currentNode: s.currentNode,
    mcpServers,
    setters: s.setters,
    onZoomToNode,
    onSelectNode,
  });

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
    start,
    stop,
    sendMessage,
  };
}
