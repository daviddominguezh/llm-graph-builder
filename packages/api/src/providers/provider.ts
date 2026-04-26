import type { McpServerConfig } from '@daviddh/graph-types';

import type { Logger } from '../utils/logger.js';
import type { OpenFlowTool } from './types.js';

export type ProviderType = 'builtin' | 'mcp';

export interface OAuthTokenBundle {
  accessToken: string;
  expiresAt: number;
  scopes?: string[];
  tokenIssuedAt: number;
}

/**
 * Per-execution context. Universal fields only. Provider-specific runtime
 * dependencies (forms list, lead-scoring service, dispatch credentials, etc.)
 * are accessed via `services<T>(providerId)` so adding a new built-in provider
 * does not require editing this type.
 */
export interface ProviderCtx {
  readonly orgId: string;
  readonly agentId: string;
  readonly isChildAgent: boolean;
  readonly logger: Logger;

  readonly conversationId?: string;
  readonly contextData?: Readonly<Record<string, unknown>>;

  readonly oauthTokens: ReadonlyMap<string, OAuthTokenBundle>;
  readonly mcpServers: ReadonlyMap<string, McpServerConfig>;

  readonly services: <T>(providerId: string) => T | undefined;
}

export interface ToolDescriptor {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface Provider {
  type: ProviderType;
  id: string;
  displayName: string;
  description?: string;

  describeTools(ctx: ProviderCtx): Promise<ToolDescriptor[]>;
  buildTools(args: { toolNames: string[]; ctx: ProviderCtx }): Promise<Record<string, OpenFlowTool>>;
}
