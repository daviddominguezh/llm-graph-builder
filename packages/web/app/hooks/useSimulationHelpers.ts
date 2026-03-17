import type { OutputSchemaEntity } from '@daviddh/graph-types';
import type { Message } from '@daviddh/llm-graph-runner';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

import type { NodeProcessedEvent, SimulateRequestBody, StreamCallbacks } from '../lib/api';
import type { Agent, McpServerConfig } from '../schemas/graph.schema';
import type { ContextPreset } from '../types/preset';
import type { NodeResult, SimulationTokens } from '../types/simulation';
import { type GraphBuildInputs, buildContext, buildGraph } from '../utils/graphContext';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { stableJsonStringify } from '../utils/stableJsonHash';

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
  setStructuredOutputs: React.Dispatch<React.SetStateAction<Record<string, unknown[]>>>;
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
  outputSchemas: OutputSchemaEntity[];
  structuredOutputs: Record<string, unknown[]>;
  setters: SimulationSetters;
  onZoomToNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
}

export interface BuildSimulateParamsOptions extends Pick<
  GraphBuildInputs,
  'agents' | 'mcpServers' | 'outputSchemas'
> {
  snapshot: GraphSnapshot;
  allMessages: Message[];
  currentNode: string;
  preset: ContextPreset;
  apiKeyId: string;
  structuredOutputs?: Record<string, unknown[]>;
}

function addTokens(prev: SimulationTokens, usage: SimulationTokens): SimulationTokens {
  return {
    input: prev.input + usage.input,
    output: prev.output + usage.output,
    cached: prev.cached + usage.cached,
  };
}

function mergeStructuredOutput(
  prev: Record<string, unknown[]>,
  output: { nodeId: string; data: unknown }
): Record<string, unknown[]> {
  const { nodeId, data } = output;
  const existing = prev[nodeId] ?? [];
  const hash = stableJsonStringify(data);
  const alreadyExists = existing.some((e) => stableJsonStringify(e) === hash);
  if (alreadyExists) return prev;
  return { ...prev, [nodeId]: [...existing, data] };
}

function handleNodeProcessedEvent(setters: SimulationSetters, event: NodeProcessedEvent): void {
  const result: NodeResult = {
    nodeId: event.nodeId,
    text: event.text,
    output: event.output,
    toolCalls: event.toolCalls,
    reasoning: event.reasoning,
    error: event.error,
    tokens: event.tokens,
    durationMs: event.durationMs,
  };
  setters.setNodeResults((prev) => [...prev, result]);
  setters.setTotalTokens((prev) => addTokens(prev, event.tokens));
  const { structuredOutput } = event;
  if (structuredOutput !== undefined) {
    setters.setStructuredOutputs((prev) => mergeStructuredOutput(prev, structuredOutput));
  }
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
      setters.setCurrentNode(nodeId);
      setters.setVisitedNodes((prev) => [...prev, nodeId]);
      onZoomToNode(nodeId);
      onSelectNode(nodeId);
    },
    onNodeProcessed: (event) => {
      handleNodeProcessedEvent(setters, event);
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
    ...buildGraph(opts.snapshot.nodes, opts.snapshot.edges, opts.agents, opts.mcpServers, opts.outputSchemas),
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
    structuredOutputs: opts.structuredOutputs,
  };
}
