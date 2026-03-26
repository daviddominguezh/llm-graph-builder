import type { Graph } from '@daviddh/graph-types';
import type { CallAgentOutput, Message, NodeProcessedEvent } from '@daviddh/llm-graph-runner';

import type { McpSession } from '../../mcp/lifecycle.js';

/* ------------------------------------------------------------------ */
/*  Input / Output types                                               */
/* ------------------------------------------------------------------ */

export interface SimulateInput {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentNode?: string;
  modelId?: string;
  data?: Record<string, unknown>;
}

export interface SimulationToolCall {
  toolName: string;
  input: unknown;
  output: unknown;
}

export interface SimulationTokenUsage {
  input: number;
  output: number;
  cached: number;
}

export interface SimulationResult {
  response: string | null;
  visitedNodes: string[];
  toolCalls: SimulationToolCall[];
  tokenUsage: SimulationTokenUsage;
}

/* ------------------------------------------------------------------ */
/*  Execution params                                                   */
/* ------------------------------------------------------------------ */

export interface SimulationExecutionParams {
  graph: Graph;
  apiKey: string;
  modelId: string;
  messages: Message[];
  currentNode: string | undefined;
  session: McpSession;
  data: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Runner function signature (injectable for testing)                  */
/* ------------------------------------------------------------------ */

export type RunSimulationFn = (params: SimulationExecutionParams) => Promise<CallAgentOutput | null>;

export type CollectedEvent = NodeProcessedEvent;
