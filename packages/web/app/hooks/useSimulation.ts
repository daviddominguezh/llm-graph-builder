import { MESSAGES_PROVIDER, type Message } from '@daviddh/llm-graph-runner';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback, useRef, useState } from 'react';

import { type SimulateRequestBody, type StreamCallbacks, streamSimulation } from '../lib/api';
import type { Agent, McpServerConfig } from '../schemas/graph.schema';
import type { ContextPreset } from '../types/preset';
import type { SimulationStep, SimulationTokens } from '../types/simulation';
import { START_NODE_ID, buildContext, buildGraph } from '../utils/graphContext';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';

const INITIAL_TOKEN_COUNT = 0;

interface GraphSnapshot {
  nodes: Array<RFNode<RFNodeData>>;
  edges: Array<RFEdge<RFEdgeData>>;
}

interface UseSimulationParams {
  allNodes: Array<RFNode<RFNodeData>>;
  edges: Array<RFEdge<RFEdgeData>>;
  agents: Agent[];
  preset: ContextPreset | undefined;
  apiKeyId: string;
  mcpServers: McpServerConfig[];
  onZoomToNode: (nodeId: string) => void;
  onExitZoomView: () => void;
}

export interface SimulationState {
  active: boolean;
  loading: boolean;
  currentNode: string;
  steps: SimulationStep[];
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

function addTokens(prev: SimulationTokens, usage: SimulationTokens): SimulationTokens {
  return {
    input: prev.input + usage.input,
    output: prev.output + usage.output,
    cached: prev.cached + usage.cached,
  };
}

interface SimulationSetters {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setSteps: React.Dispatch<React.SetStateAction<SimulationStep[]>>;
  setTotalTokens: React.Dispatch<React.SetStateAction<SimulationTokens>>;
  setCurrentNode: React.Dispatch<React.SetStateAction<string>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  saveSnapshot: (s: GraphSnapshot | null) => void;
  getSnapshot: () => GraphSnapshot | null;
}

interface SimulationStartDeps {
  setters: SimulationSetters & { setActive: React.Dispatch<React.SetStateAction<boolean>> };
  allNodes: Array<RFNode<RFNodeData>>;
  edges: Array<RFEdge<RFEdgeData>>;
  onZoomToNode: (nodeId: string) => void;
}

function useSimulationStart(deps: SimulationStartDeps): () => void {
  const { setters, allNodes, edges, onZoomToNode } = deps;

  return useCallback(() => {
    setters.saveSnapshot({ nodes: [...allNodes], edges: [...edges] });
    setters.setActive(true);
    setters.setCurrentNode(START_NODE_ID);
    setters.setMessages([]);
    setters.setSteps([]);
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
    setters.setSteps([]);
    setters.setTotalTokens(EMPTY_TOKENS);
    onExitZoomView();
  }, [setters, onExitZoomView]);
}

interface SendMessageDeps {
  preset: ContextPreset | undefined;
  loading: boolean;
  messages: Message[];
  agents: Agent[];
  apiKeyId: string;
  currentNode: string;
  mcpServers: McpServerConfig[];
  setters: SimulationSetters;
  onZoomToNode: (nodeId: string) => void;
}

function buildStreamCallbacks(
  userText: string,
  setters: SimulationSetters,
  onZoomToNode: (nodeId: string) => void
): StreamCallbacks {
  return {
    onNodeVisited: (nodeId: string) => {
      setters.setCurrentNode(nodeId);
      onZoomToNode(nodeId);
    },
    onAgentResponse: (event) => {
      const step: SimulationStep = {
        userText,
        agentText: event.text,
        visitedNodes: event.visitedNodes,
        tokenUsage: event.tokenUsage,
      };
      setters.setSteps((prev) => [...prev, step]);
      setters.setTotalTokens((prev) => addTokens(prev, event.tokenUsage));
    },
    onComplete: () => {
      setters.setLoading(false);
    },
    onError: () => {
      setters.setLoading(false);
    },
  };
}

interface BuildSimulateParamsOptions {
  snapshot: GraphSnapshot;
  agents: Agent[];
  mcpServers: McpServerConfig[];
  allMessages: Message[];
  currentNode: string;
  preset: ContextPreset;
  apiKeyId: string;
}

function buildSimulateParams(opts: BuildSimulateParamsOptions): SimulateRequestBody {
  const graph: Record<string, unknown> = {
    ...buildGraph(opts.snapshot.nodes, opts.snapshot.edges, opts.agents, opts.mcpServers),
  };
  const fullContext = buildContext(opts.preset, '');
  const { sessionID, tenantID, userID, data, quickReplies } = fullContext;
  return {
    graph,
    messages: opts.allMessages,
    currentNode: opts.currentNode,
    apiKeyId: opts.apiKeyId,
    sessionID,
    tenantID,
    userID,
    data,
    quickReplies,
  };
}

function useSimulationSend(deps: SendMessageDeps): (text: string) => void {
  const { preset, loading, messages, agents, apiKeyId, currentNode, mcpServers } = deps;
  const { setters, onZoomToNode } = deps;

  return useCallback(
    (text: string) => {
      const snapshot = setters.getSnapshot();
      if (preset === undefined || loading || snapshot === null) return;
      setters.setLoading(true);

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
      const callbacks = buildStreamCallbacks(text, setters, onZoomToNode);

      void streamSimulation(params, callbacks).catch(() => {
        setters.setLoading(false);
      });
    },
    [preset, loading, messages, agents, apiKeyId, currentNode, mcpServers, setters, onZoomToNode]
  );
}

export function useSimulation(params: UseSimulationParams): SimulationState {
  const { allNodes, edges, agents, preset, apiKeyId, mcpServers, onZoomToNode, onExitZoomView } = params;

  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentNode, setCurrentNode] = useState(START_NODE_ID);
  const [messages, setMessages] = useState<Message[]>([]);
  const [steps, setSteps] = useState<SimulationStep[]>([]);
  const [totalTokens, setTotalTokens] = useState<SimulationTokens>(EMPTY_TOKENS);
  const snapshotRef = useRef<GraphSnapshot | null>(null);
  const saveSnapshot = useCallback((s: GraphSnapshot | null) => {
    snapshotRef.current = s;
  }, []);
  const getSnapshot = useCallback((): GraphSnapshot | null => snapshotRef.current, []);

  const setters: SimulationSetters & { setActive: React.Dispatch<React.SetStateAction<boolean>> } = {
    setMessages,
    setSteps,
    setTotalTokens,
    setCurrentNode,
    setLoading,
    setActive,
    saveSnapshot,
    getSnapshot,
  };

  const start = useSimulationStart({ setters, allNodes, edges, onZoomToNode });
  const stop = useSimulationStop(setters, onExitZoomView);
  const sendMessage = useSimulationSend({
    preset,
    loading,
    messages,
    agents,
    apiKeyId,
    currentNode,
    mcpServers,
    setters,
    onZoomToNode,
  });

  return { active, loading, currentNode, steps, totalTokens, start, stop, sendMessage };
}
