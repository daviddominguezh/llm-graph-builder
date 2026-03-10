import type { Message } from '@daviddh/llm-graph-runner';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { flushSync } from 'react-dom';

import type { SimulateRequestBody, StreamCallbacks } from '../lib/api';
import type { Agent, McpServerConfig } from '../schemas/graph.schema';
import type { ContextPreset } from '../types/preset';
import type { NodeResult, SimulationTokens } from '../types/simulation';
import { buildContext, buildGraph } from '../utils/graphContext';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';

export interface GraphSnapshot {
  nodes: Array<RFNode<RFNodeData>>;
  edges: Array<RFEdge<RFEdgeData>>;
}

export interface SimulationSetters {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setNodeResults: React.Dispatch<React.SetStateAction<NodeResult[]>>;
  setLastUserText: React.Dispatch<React.SetStateAction<string>>;
  setTotalTokens: React.Dispatch<React.SetStateAction<SimulationTokens>>;
  setCurrentNode: React.Dispatch<React.SetStateAction<string>>;
  setVisitedNodes: React.Dispatch<React.SetStateAction<string[]>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  saveSnapshot: (s: GraphSnapshot | null) => void;
  getSnapshot: () => GraphSnapshot | null;
}

export type FullSetters = SimulationSetters & { setActive: React.Dispatch<React.SetStateAction<boolean>> };

export interface SimulationStartDeps {
  setters: FullSetters;
  allNodes: Array<RFNode<RFNodeData>>;
  edges: Array<RFEdge<RFEdgeData>>;
  onZoomToNode: (nodeId: string) => void;
}

export interface SendMessageDeps {
  preset: ContextPreset | undefined;
  loading: boolean;
  messages: Message[];
  agents: Agent[];
  apiKeyId: string;
  currentNode: string;
  mcpServers: McpServerConfig[];
  setters: SimulationSetters;
  onZoomToNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
}

export interface BuildSimulateParamsOptions {
  snapshot: GraphSnapshot;
  agents: Agent[];
  mcpServers: McpServerConfig[];
  allMessages: Message[];
  currentNode: string;
  preset: ContextPreset;
  apiKeyId: string;
}

function addTokens(prev: SimulationTokens, usage: SimulationTokens): SimulationTokens {
  return {
    input: prev.input + usage.input,
    output: prev.output + usage.output,
    cached: prev.cached + usage.cached,
  };
}

export interface StreamCallbackDeps {
  setters: SimulationSetters;
  onZoomToNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
}

export function buildStreamCallbacks(deps: StreamCallbackDeps): StreamCallbacks {
  const { setters, onZoomToNode, onSelectNode } = deps;
  return {
    onNodeVisited: (nodeId: string) => {
      flushSync(() => {
        setters.setCurrentNode(nodeId);
        setters.setVisitedNodes((prev) => [...prev, nodeId]);
      });
      onZoomToNode(nodeId);
      onSelectNode(nodeId);
    },
    onNodeProcessed: (event) => {
      const result: NodeResult = {
        nodeId: event.nodeId,
        text: event.text,
        toolCalls: event.toolCalls,
        tokens: event.tokens,
        durationMs: event.durationMs,
      };
      flushSync(() => {
        setters.setNodeResults((prev) => [...prev, result]);
        setters.setTotalTokens((prev) => addTokens(prev, event.tokens));
      });
    },
    onAgentResponse: () => {
      /* data already captured via onNodeProcessed */
    },
    onComplete: () => {
      setters.setLoading(false);
    },
    onError: () => {
      setters.setLoading(false);
    },
  };
}

export function buildSimulateParams(opts: BuildSimulateParamsOptions): SimulateRequestBody {
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
