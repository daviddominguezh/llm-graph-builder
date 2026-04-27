import type { Logger } from '../utils/logger.js';
import type { Provider, ProviderCtx, ToolDescriptor } from './provider.js';

export interface IndexEntry {
  provider: Provider;
  descriptor: ToolDescriptor;
}

export type ConflictReporter = (conflict: { inBuiltin: string; inMcp: string; toolName: string }) => void;

interface ConflictCtx {
  logger: Logger;
  reportConflict: ConflictReporter;
}

function pickWinner(existing: IndexEntry, incoming: IndexEntry): { winner: IndexEntry; loser: IndexEntry } {
  return existing.provider.type === 'builtin'
    ? { winner: existing, loser: incoming }
    : { winner: incoming, loser: existing };
}

function resolveConflict(existing: IndexEntry, incoming: IndexEntry, conflict: ConflictCtx): IndexEntry {
  const { winner, loser } = pickWinner(existing, incoming);
  const { descriptor } = incoming;
  const { toolName } = descriptor;
  conflict.reportConflict({ inBuiltin: winner.provider.id, inMcp: loser.provider.id, toolName });
  conflict.logger.warn(
    `tool name collision: ${toolName} (built-in ${winner.provider.id} wins; mcp ${loser.provider.id} dropped)`
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
    const existing = index.get(descriptor.toolName);
    if (existing === undefined) {
      index.set(descriptor.toolName, incoming);
      continue;
    }
    index.set(descriptor.toolName, resolveConflict(existing, incoming, conflict));
  }
}

async function describeOneSafely(
  provider: Provider,
  ctx: ProviderCtx,
  logger: Logger
): Promise<{ provider: Provider; descriptors: ToolDescriptor[] }> {
  try {
    const descriptors = await provider.describeTools(ctx);
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
