import type { Tool } from 'ai';

import type { Graph } from './graph.js';

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
