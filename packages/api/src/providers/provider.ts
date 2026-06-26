import type { McpServerConfig } from '@daviddh/graph-types';

import type { Logger } from '../utils/logger.js';
import type { BuiltinBundles, BuiltinProviderId } from './bundles.js';
import type { OpenFlowTool, RawJsonSchema } from './types.js';

export type ProviderType = 'builtin' | 'mcp';

export interface OAuthTokenBundle {
  accessToken: string;
  expiresAt: number;
  scopes?: string[];
  tokenIssuedAt: number;
}

/**
 * Typed resolver for per-provider runtime bundles.
 *
 * Calling with a known `BuiltinProviderId` returns the bundle type from
 * `BuiltinBundles` (or `undefined` when the edge function did not construct
 * one); the fallback `string` overload preserves access for MCP / unknown
 * provider ids and keeps the `unknown` discipline at the runtime trust
 * boundary.
 *
 * Overload order matters — the literal `BuiltinProviderId` branch must come
 * first so it wins for narrowed inputs.
 */
export interface ServicesResolver {
  <P extends BuiltinProviderId>(providerId: P): BuiltinBundles[P] | undefined;
  (providerId: string): unknown;
}

/**
 * Per-execution context. Universal fields only. Provider-specific runtime
 * dependencies (forms list, lead-scoring service, dispatch credentials, etc.)
 * are accessed via `services<T>(providerId)` so adding a new built-in provider
 * does not require editing this type.
 */
export interface ProviderCtx {
  readonly orgId: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly isChildAgent: boolean;
  readonly logger: Logger;

  readonly conversationId?: string;
  readonly contextData?: Readonly<Record<string, unknown>>;

  readonly oauthTokens: ReadonlyMap<string, OAuthTokenBundle>;
  readonly mcpServers: ReadonlyMap<string, McpServerConfig>;

  readonly services: ServicesResolver;
}

export interface ToolDescriptor {
  toolName: string;
  description: string;
  inputSchema: RawJsonSchema;
}

export interface DescribeToolsWithMeta {
  tools: ToolDescriptor[];
  cachedAt?: number;
  serverVersion?: string;
}

export type DescribeToolsResult = ToolDescriptor[] | DescribeToolsWithMeta;

export interface Provider {
  type: ProviderType;
  id: string;
  displayName: string;
  description?: string;

  describeTools: (ctx: ProviderCtx) => Promise<DescribeToolsResult>;
  // Returns a subset of the provider's tools (the caller may request only some).
  // `Partial` is required for typed built-in providers to assign cleanly here:
  // a narrow `Partial<Record<'list_keys' | 'search', …>>` widens to this shape
  // without falsely claiming every string key has a tool.
  buildTools: (args: {
    toolNames: string[];
    ctx: ProviderCtx;
  }) => Promise<Partial<Record<string, OpenFlowTool>>>;
}

/**
 * Built-in provider with a statically declared tool-name tuple. The tuple is
 * the source of truth for which tools the provider exposes; `buildTools`
 * returns a `Partial` map over those names (a subset is requested per call)
 * and the runtime backstop test asserts the tuple matches the descriptors
 * `describeTools` emits.
 *
 * `TN` is parameterised so that providers can pass a literal `as const` tuple
 * and the buildTools return type narrows to that tuple's union. MCP providers
 * stay on the loose `Provider` interface — their tool names are discovered at
 * runtime and have no compile-time identity.
 */
export interface BuiltinProvider<
  P extends BuiltinProviderId,
  TN extends readonly string[] = readonly string[],
> extends Provider {
  type: 'builtin';
  id: P;
  toolNames: TN;
  buildTools: (args: {
    toolNames: string[];
    ctx: ProviderCtx;
  }) => Promise<Partial<Record<TN[number], OpenFlowTool>>>;
}
