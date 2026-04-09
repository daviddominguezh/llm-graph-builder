import type { McpTransport, RuntimeGraph } from '@daviddh/graph-types';
import type { Message } from '@daviddh/llm-graph-runner';

export interface DiscoverRequest {
  transport: McpTransport;
}

export interface DiscoveredTool {
  name: string;
  description: string | undefined;
  inputSchema: Record<string, unknown> | undefined;
}

export interface DiscoverResponse {
  tools: DiscoveredTool[];
}

export interface SimulateRequest {
  graph: RuntimeGraph;
  messages: Message[];
  currentNode: string;
  apiKey: string;
  modelId: string;
  sessionID: string;
  tenantID: string;
  userID: string;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
  structuredOutputs?: Record<string, unknown[]>;
  orgId?: string;
}

export interface ToolCallRequest {
  transport: McpTransport;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolCallSuccessResponse {
  success: true;
  result: unknown;
}

export interface ToolCallErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export type ToolCallResponse = ToolCallSuccessResponse | ToolCallErrorResponse;

export type SimulationEvent =
  | { type: 'node_visited'; nodeId: string }
  | {
      type: 'node_processed';
      nodeId: string;
      text: string;
      output?: unknown;
      toolCalls: Array<{ toolName: string; input: unknown; output?: unknown }>;
      reasoning?: string;
      error?: string;
      tokens: { input: number; output: number; cached: number; costUSD?: number };
      durationMs: number;
      structuredOutput?: { nodeId: string; data: unknown };
    }
  | {
      type: 'agent_response';
      text: string;
      visitedNodes: string[];
      toolCalls: Array<{ toolName: string; input: unknown; output: unknown }>;
      nodeTokens: Array<{ node: string; tokens: { input: number; output: number; cached: number } }>;
      tokenUsage: { input: number; output: number; cached: number };
    }
  | { type: 'error'; message: string }
  | { type: 'simulation_complete' }
  | { type: 'child_dispatched'; dispatchType: string; params: Record<string, unknown> };
