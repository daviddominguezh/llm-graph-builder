import type { McpServerConfig } from '@daviddh/graph-types';

import type { SelectedTool } from '../types/selectedTool.js';
import type { Logger } from '../utils/logger.js';
import { type IndexEntry, buildToolIndex } from './buildToolIndex.js';
import { buildMcpProvider } from './mcp/buildMcpProvider.js';
import type { Provider, ProviderCtx, ToolDescriptor } from './provider.js';
import type { OpenFlowTool } from './types.js';

export type FailureReason = 'auth_failed' | 'timeout' | 'protocol_error' | 'unknown';

export interface ProviderFailure {
  providerType: 'builtin' | 'mcp';
  providerId: string;
  reason: FailureReason;
  detail: string;
}

export interface RegistryBuildResult {
  tools: Record<string, OpenFlowTool>;
  staleRefs: SelectedTool[];
  failedProviders: ProviderFailure[];
}

export interface DescribeAllItem {
  provider: Provider;
  tools: ToolDescriptor[];
  error?: { reason: FailureReason; detail: string };
}

export interface Registry {
  readonly providers: readonly Provider[];
  readonly findToolByName: (toolName: string, ctx: ProviderCtx) => Promise<IndexEntry | null>;
  readonly buildSelected: (args: { refs: SelectedTool[]; ctx: ProviderCtx }) => Promise<RegistryBuildResult>;
  readonly describeAll: (ctx: ProviderCtx) => Promise<DescribeAllItem[]>;
}

export interface ComposeRegistryArgs {
  builtIns: ReadonlyMap<string, Provider>;
  orgMcpServers: McpServerConfig[];
  logger: Logger;
}

function classifyError(err: unknown): FailureReason {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  if (msg.includes('auth') || msg.includes('401') || msg.includes('403')) return 'auth_failed';
  if (msg.includes('timeout') || msg.includes('etimedout')) return 'timeout';
  if (msg.includes('protocol') || msg.includes('invalid response')) return 'protocol_error';
  return 'unknown';
}

interface ProviderGroup {
  provider: Provider;
  toolNames: string[];
}

function appendToGroup(groups: Map<string, ProviderGroup>, provider: Provider, ref: SelectedTool): void {
  const key = `${ref.providerType}:${ref.providerId}`;
  const existing = groups.get(key);
  if (existing === undefined) {
    groups.set(key, { provider, toolNames: [ref.toolName] });
    return;
  }
  existing.toolNames.push(ref.toolName);
}

function groupRefsByProvider(
  providers: readonly Provider[],
  refs: SelectedTool[]
): { groups: Map<string, ProviderGroup>; stale: SelectedTool[] } {
  const groups = new Map<string, ProviderGroup>();
  const stale: SelectedTool[] = [];
  for (const ref of refs) {
    const provider = providers.find((p) => p.type === ref.providerType && p.id === ref.providerId);
    if (provider === undefined) stale.push(ref);
    else appendToGroup(groups, provider, ref);
  }
  return { groups, stale };
}

type GroupResult = { tools: Record<string, OpenFlowTool> } | { failure: ProviderFailure };

async function buildOneGroup(group: ProviderGroup, ctx: ProviderCtx): Promise<GroupResult> {
  try {
    const tools = await group.provider.buildTools({ toolNames: group.toolNames, ctx });
    return { tools };
  } catch (err) {
    return {
      failure: {
        providerType: group.provider.type,
        providerId: group.provider.id,
        reason: classifyError(err),
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

async function describeOne(provider: Provider, ctx: ProviderCtx): Promise<DescribeAllItem> {
  try {
    const tools = await provider.describeTools(ctx);
    return { provider, tools };
  } catch (err) {
    return {
      provider,
      tools: [],
      error: { reason: classifyError(err), detail: err instanceof Error ? err.message : String(err) },
    };
  }
}

function collectGroupResults(results: GroupResult[]): {
  tools: Record<string, OpenFlowTool>;
  failed: ProviderFailure[];
} {
  const tools: Record<string, OpenFlowTool> = {};
  const failed: ProviderFailure[] = [];
  for (const r of results) {
    if ('tools' in r) Object.assign(tools, r.tools);
    else failed.push(r.failure);
  }
  return { tools, failed };
}

async function buildSelectedImpl(
  providers: readonly Provider[],
  refs: SelectedTool[],
  ctx: ProviderCtx
): Promise<RegistryBuildResult> {
  const { groups, stale } = groupRefsByProvider(providers, refs);
  const results = await Promise.all(
    Array.from(groups.values()).map(async (g) => await buildOneGroup(g, ctx))
  );
  const { tools, failed } = collectGroupResults(results);
  return { tools, staleRefs: stale, failedProviders: failed };
}

type EnsureIndex = (ctx: ProviderCtx) => Promise<ReadonlyMap<string, IndexEntry>>;

function makeEnsureIndex(providers: readonly Provider[], logger: Logger): EnsureIndex {
  const cache = new WeakMap<ProviderCtx, Promise<ReadonlyMap<string, IndexEntry>>>();
  return async (ctx) => {
    const cached = cache.get(ctx);
    if (cached !== undefined) return await cached;
    const promise = buildToolIndex(providers, ctx, logger);
    cache.set(ctx, promise);
    return await promise;
  };
}

function freezeProviders(
  builtIns: ReadonlyMap<string, Provider>,
  mcpServers: McpServerConfig[]
): readonly Provider[] {
  const mcpProviders = mcpServers.map(buildMcpProvider);
  return Object.freeze([...builtIns.values(), ...mcpProviders]);
}

async function findToolByNameImpl(
  ensureIndex: EnsureIndex,
  toolName: string,
  ctx: ProviderCtx
): Promise<IndexEntry | null> {
  const index = await ensureIndex(ctx);
  return index.get(toolName) ?? null;
}

async function describeAllImpl(
  providers: readonly Provider[],
  ensureIndex: EnsureIndex,
  ctx: ProviderCtx
): Promise<DescribeAllItem[]> {
  const items = await Promise.all(providers.map(async (p) => await describeOne(p, ctx)));
  // Background-warm the index for subsequent findToolByName calls. Best-effort —
  // if a provider fails (e.g., MCP 401), buildToolIndex now skips it, but we still
  // catch any residual rejection here to prevent unhandled promise rejections from
  // crashing the host process.
  ensureIndex(ctx).catch((err: unknown) => {
    const detail = err instanceof Error ? err.message : String(err);
    ctx.logger.warn(`tool index warm failed: ${detail}`);
  });
  return items;
}

export function composeRegistry(args: ComposeRegistryArgs): Registry {
  const allProviders = freezeProviders(args.builtIns, args.orgMcpServers);
  const ensureIndex = makeEnsureIndex(allProviders, args.logger);
  return Object.freeze<Registry>({
    providers: allProviders,
    findToolByName: async (toolName, ctx) => await findToolByNameImpl(ensureIndex, toolName, ctx),
    describeAll: async (ctx) => await describeAllImpl(allProviders, ensureIndex, ctx),
    buildSelected: async ({ refs, ctx }) => await buildSelectedImpl(allProviders, refs, ctx),
  });
}
