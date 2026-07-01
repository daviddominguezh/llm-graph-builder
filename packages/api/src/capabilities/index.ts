import type { McpServerConfig } from '@daviddh/graph-types';

import type { SkillDefinition } from '../agentLoop/agentLoopTypes.js';
import type { McpInvoker } from '../providers/mcp/poolClient.js';
import type { DispatchPersistence } from './dispatchPersistence.js';
import type { DispatchStrategy } from './dispatchStrategy.js';
import type { Observability, RateLimiter, RunnerLogger } from './observability.js';

export type {
  BeforeDispatchArgs,
  DispatchHandle,
  DispatchPersistence,
  OnChildErrorArgs,
  OnChildFinishArgs,
} from './dispatchPersistence.js';
export type { DispatchArgs, DispatchOutcome, DispatchStrategy } from './dispatchStrategy.js';
export type { Observability, RateLimiter, RunnerLogger } from './observability.js';

// RU2 is landed: use the real McpInvoker contract from the MCP pool client.
export type { McpInvoker } from '../providers/mcp/poolClient.js';

export type SupabaseLike = Record<string, unknown>;

export interface RuntimeCapabilities {
  persistence: DispatchPersistence;
  dispatch: DispatchStrategy;
  observability: Observability;
  rateLimit: RateLimiter;
  logger: RunnerLogger;
}

export interface ResolveChildInput {
  dispatchType: 'create_agent' | 'invoke_agent' | 'invoke_workflow';
  params: Record<string, unknown>;
  orgId: string;
}

export interface ResolvedChildConfig {
  systemPrompt: string;
  context: string;
  modelId: string;
  maxSteps: number | null;
  mcpServers: McpServerConfig[];
  skills: SkillDefinition[];
  isChildAgent: boolean;
  task: string;
  agentId?: string;
  version?: number;
}

export interface RuntimeServices {
  mcpPool: McpInvoker;
  resolveChildConfig: (input: ResolveChildInput) => Promise<ResolvedChildConfig>;
  supabase: SupabaseLike;
}
