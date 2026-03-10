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
  sessionID: string;
  tenantID: string;
  userID: string;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
}

export type SimulationEvent =
  | { type: 'node_visited'; nodeId: string }
  | {
      type: 'agent_response';
      text: string;
      visitedNodes: string[];
      toolCalls: Array<{ toolName: string; input: unknown; output: unknown }>;
      nodeTokens: Array<{ node: string; tokens: { input: number; output: number; cached: number } }>;
      tokenUsage: { input: number; output: number; cached: number };
    }
  | { type: 'error'; message: string }
  | { type: 'simulation_complete' };
