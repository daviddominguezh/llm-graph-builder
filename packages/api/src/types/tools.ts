import type { McpServerConfig } from '@daviddh/graph-types';
import type { Tool } from 'ai';

import type { OAuthTokenBundle } from '../providers/provider.js';
import type { Registry } from '../providers/registry.js';
import type { Logger } from '../utils/logger.js';
import type { TokenLog } from './ai/logs.js';
import type { FormDefinition } from './forms.js';
import type { Graph } from './graph.js';

export interface SimToolCall {
  toolName: string;
  input: unknown;
  output?: unknown;
}

export interface NodeProcessedEvent {
  nodeId: string;
  text?: string;
  output?: unknown;
  toolCalls: SimToolCall[];
  reasoning?: string;
  error?: string;
  tokens: TokenLog;
  durationMs: number;
  structuredOutput?: { nodeId: string; data: unknown };
  responseMessages?: unknown[];
}

export interface Context {
  graph: Graph;
  apiKey: string;
  modelId: string;
  sessionID: string;
  tenantID: string;
  userID: string;
  data: Record<string, unknown>;
  forms?: FormDefinition[];
  quickReplies: Record<string, string>;
  isFirstMessage?: boolean;
  currentTime?: string;
  userToken?: string;
  toolsOverride?: Record<string, Tool>;
  onNodeVisited?: (nodeId: string) => void;
  onNodeProcessed?: (event: NodeProcessedEvent) => void;

  // Registry-backed execution (all optional — existing callers unaffected):
  registry?: Registry;
  orgId?: string;
  agentId?: string;
  isChildAgent?: boolean;
  conversationId?: string;
  contextData?: Readonly<Record<string, unknown>>;
  oauthTokens?: ReadonlyMap<string, OAuthTokenBundle>;
  mcpServers?: ReadonlyMap<string, McpServerConfig>;
  services?: (providerId: string) => unknown;
  logger?: Logger;
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
