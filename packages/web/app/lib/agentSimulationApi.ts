import type { McpServerConfig } from '@daviddh/graph-types';

export interface CompositionStackEntry {
  appType: 'agent' | 'workflow';
  parentToolCallId: string;
  parentMessages: unknown[];
  parentCurrentNodeId?: string;
  parentStructuredOutputs?: Record<string, unknown[]>;
}

export interface AgentSimulateRequestBody {
  appType: 'agent';
  systemPrompt: string;
  maxSteps: number | null;
  contextItems: Array<{ sortOrder: number; content: string }>;
  mcpServers: McpServerConfig[];
  messages: unknown[];
  apiKeyId: string;
  modelId: string;
  skills?: Array<{ name: string; description: string; content: string }>;
  orgId?: string;
  composition?: {
    depth: number;
    stack: CompositionStackEntry[];
  };
}
