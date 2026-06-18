import type { Logger } from '../utils/logger.js';
import type { Provider, ProviderCtx, ProviderType, ToolDescriptor } from './provider.js';
import { namespaceToolName } from './types.js';

export interface IndexEntry {
  provider: Provider;
  descriptor: ToolDescriptor;
}

/**
 * Reported when two providers ever publish the same LLM-facing tool name.
 * With provider-namespaced names (`${providerId}__${toolName}`) collisions are
 * impossible across distinct providers; the only remaining surface is a single
 * provider (or, e.g., an MCP server) that explicitly chose a name shaped like
 * `${someProviderId}__${someName}`. Kept as defense-in-depth.
 */
export type ConflictReporter = (conflict: {
  namespacedName: string;
  winnerProviderId: string;
  winnerProviderType: ProviderType;
  loserProviderId: string;
  loserProviderType: ProviderType;
  toolName: string;
}) => void;

interface ConflictCtx {
  logger: Logger;
  reportConflict: ConflictReporter;
}

function pickWinner(existing: IndexEntry, incoming: IndexEntry): { winner: IndexEntry; loser: IndexEntry } {
  return existing.provider.type === 'builtin'
    ? { winner: existing, loser: incoming }
    : { winner: incoming, loser: existing };
}

function resolveConflict(
  existing: IndexEntry,
  incoming: IndexEntry,
  namespacedName: string,
  conflict: ConflictCtx
): IndexEntry {
  const { winner, loser } = pickWinner(existing, incoming);
  const { descriptor } = incoming;
  const { toolName } = descriptor;
  conflict.reportConflict({
    namespacedName,
    winnerProviderId: winner.provider.id,
    winnerProviderType: winner.provider.type,
    loserProviderId: loser.provider.id,
    loserProviderType: loser.provider.type,
    toolName,
  });
  conflict.logger.warn(
    `tool name collision: ${namespacedName} (${winner.provider.type} ${winner.provider.id} wins; ${loser.provider.type} ${loser.provider.id} dropped)`
  );
  return winner;
}

function indexDescriptors(
  index: Map<string, IndexEntry>,
  provider: Provider,
  descriptors: ToolDescriptor[],
  conflict: ConflictCtx
): void {
  for (const descriptor of descriptors) {
    const incoming: IndexEntry = { provider, descriptor };
    const namespacedName = namespaceToolName(provider.id, descriptor.toolName);
    const existing = index.get(namespacedName);
    if (existing === undefined) {
      index.set(namespacedName, incoming);
      continue;
    }
    index.set(namespacedName, resolveConflict(existing, incoming, namespacedName, conflict));
  }
}

async function describeOneSafely(
  provider: Provider,
  ctx: ProviderCtx,
  logger: Logger
): Promise<{ provider: Provider; descriptors: ToolDescriptor[] }> {
  try {
    const result = await provider.describeTools(ctx);
    const descriptors = Array.isArray(result) ? result : result.tools;
    return { provider, descriptors };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.warn(`tool index: skipping ${provider.type}:${provider.id} — describeTools failed: ${detail}`);
    return { provider, descriptors: [] };
  }
}

export async function buildToolIndex(
  providers: readonly Provider[],
  ctx: ProviderCtx,
  logger: Logger,
  reportConflict: ConflictReporter = (): void => undefined
): Promise<ReadonlyMap<string, IndexEntry>> {
  const allDescriptors = await Promise.all(
    providers.map(async (p) => await describeOneSafely(p, ctx, logger))
  );
  const index = new Map<string, IndexEntry>();
  const conflict: ConflictCtx = { logger, reportConflict };
  for (const { provider, descriptors } of allDescriptors) {
    indexDescriptors(index, provider, descriptors, conflict);
  }
  return index;
}
