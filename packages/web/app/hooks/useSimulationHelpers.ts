import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { MESSAGES_PROVIDER, type Message } from '@daviddh/llm-graph-runner';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';

import type { AgentSimulateRequestBody } from '../lib/agentSimulationApi';
import type { NodeProcessedEvent, SimulateRequestBody, StreamCallbacks } from '../lib/api';
import type { Agent, McpServerConfig } from '../schemas/graph.schema';
import type { ContextPreset } from '../types/preset';
import type { ConversationEntry, NodeResult, SimulationTokens } from '../types/simulation';
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
  setConversationEntries: React.Dispatch<React.SetStateAction<ConversationEntry[]>>;
  setTurnCount: React.Dispatch<React.SetStateAction<number>>;
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

interface AgentSimConfig {
  systemPrompt: string;
  maxSteps: number | null;
  contextItems: Array<{ sortOrder: number; content: string }>;
  skills: Array<{ name: string; description: string; content: string }>;
}

export interface SendMessageDeps {
  preset: ContextPreset | undefined;
  loading: boolean;
  messages: Message[];
  agents: Agent[];
  apiKeyId: string;
  modelId: string;
  currentNode: string;
  mcpServers: McpServerConfig[];
  outputSchemas: OutputSchemaEntity[];
  structuredOutputs: Record<string, unknown[]>;
  setters: SimulationSetters;
  onZoomToNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  appType?: 'workflow' | 'agent';
  agentConfig?: AgentSimConfig;
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
  modelId: string;
  structuredOutputs?: Record<string, unknown[]>;
}

function addCost(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function addTokens(prev: SimulationTokens, usage: SimulationTokens): SimulationTokens {
  return {
    input: prev.input + usage.input,
    output: prev.output + usage.output,
    cached: prev.cached + usage.cached,
    costUSD: addCost(prev.costUSD, usage.costUSD),
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
  setters.setConversationEntries((prev) => [...prev, { type: 'result', result }]);
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

function createAssistantMessage(text: string): Message {
  return {
    id: nanoid(),
    provider: MESSAGES_PROVIDER.WEB,
    type: 'text',
    timestamp: Date.now(),
    originalId: nanoid(),
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  };
}

export function buildStreamCallbacks(deps: StreamCallbackDeps): StreamCallbacks {
  const { setters, onZoomToNode, onSelectNode } = deps;
  let lastResponseText = '';
  return {
    onNodeVisited: (nodeId: string) => {
      setters.setCurrentNode(nodeId);
      setters.setVisitedNodes((prev) => [...prev, nodeId]);
      onZoomToNode(nodeId);
      onSelectNode(nodeId);
    },
    onNodeProcessed: (event) => {
      handleNodeProcessedEvent(setters, event);
      if (event.text !== '') lastResponseText = event.text;
    },
    onAgentResponse: () => {
      /* data already captured via onNodeProcessed */
    },
    onComplete: () => {
      setters.setLoading(false);
      if (lastResponseText !== '') {
        setters.setMessages((prev) => [...prev, createAssistantMessage(lastResponseText)]);
      }
    },
    onError: (message: string) => {
      setters.setLoading(false);
      toast.error(message);
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
    modelId: opts.modelId,
    sessionID,
    tenantID,
    userID,
    data,
    quickReplies,
    structuredOutputs: opts.structuredOutputs,
  };
}

export interface BuildAgentSimulateParamsOptions {
  agentConfig: AgentSimConfig;
  mcpServers: McpServerConfig[];
  allMessages: Message[];
  apiKeyId: string;
  modelId: string;
}

const EMPTY = 0;

export function buildAgentSimulateParams(opts: BuildAgentSimulateParamsOptions): AgentSimulateRequestBody {
  const { agentConfig, mcpServers, allMessages, apiKeyId, modelId } = opts;
  const { skills } = agentConfig;
  return {
    appType: 'agent',
    systemPrompt: agentConfig.systemPrompt,
    maxSteps: agentConfig.maxSteps,
    contextItems: agentConfig.contextItems,
    mcpServers,
    messages: allMessages,
    apiKeyId,
    modelId,
    ...(skills.length > EMPTY
      ? { skills: skills.map((s) => ({ name: s.name, description: s.description, content: s.content })) }
      : {}),
  };
}
