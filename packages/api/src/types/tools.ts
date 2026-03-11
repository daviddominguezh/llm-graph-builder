import type { Tool, TypedToolCall } from 'ai';

import type { TokenLog } from './ai/logs.js';
import type { Graph } from './graph.js';

export interface NodeProcessedEvent {
  nodeId: string;
  text?: string;
  toolCalls: Array<TypedToolCall<Record<string, Tool>>>;
  tokens: TokenLog;
  durationMs: number;
  structuredOutput?: { nodeId: string; data: unknown };
}

export interface Context {
  graph: Graph;
  apiKey: string;
  sessionID: string;
  tenantID: string;
  userID: string;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
  isFirstMessage?: boolean;
  currentTime?: string;
  userToken?: string;
  toolsOverride?: Record<string, Tool>;
  onNodeVisited?: (nodeId: string) => void;
  onNodeProcessed?: (event: NodeProcessedEvent) => void;
}

export interface ToolResponsePrompt {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: { result: unknown };
  isError?: boolean;
}

export interface ToolResponse {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: ToolResponsePrompt;
}
