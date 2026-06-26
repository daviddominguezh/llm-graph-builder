import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import type { PoolEntry } from './poolKey.js';

const NO_BORROWS = 0;

export function newEntry(isStdio: boolean): PoolEntry {
  return { handle: null, lastUsed: Date.now(), borrows: NO_BORROWS, isStdio };
}

/**
 * Apply a partial mutation to a pool entry. Centralized through `Object.assign`
 * so callers never reassign a property of an entry parameter directly.
 */
function patchEntry(entry: PoolEntry, patch: Partial<PoolEntry>): void {
  Object.assign(entry, patch);
}

/** Stamp the entry's `lastUsed` clock from an injectable `now` (defaults to wall clock). */
export function markUsed(entry: PoolEntry, now: () => number = Date.now): void {
  patchEntry(entry, { lastUsed: now() });
}

/**
 * Best-effort close of a handle. Takes the handle (not the entry) so callers
 * keep ownership of entry-field mutation and avoid no-param-reassign.
 */
export async function closeHandle(handle: McpClientHandle | null): Promise<void> {
  if (handle === null) return;
  try {
    await handle.close();
  } catch {
    // best-effort: the server may already be gone.
  }
}

/**
 * Best-effort close of an entry's handle and clear the slot so the next borrow
 * reconnects. Clears `connecting` too in case a stale promise lingers.
 */
export async function closeEntry(entry: PoolEntry): Promise<void> {
  const { handle } = entry;
  patchEntry(entry, { handle: null, connecting: undefined });
  await closeHandle(handle);
}

/**
 * Lazy reconnect-on-borrow. If a warm handle is present and `isHealthy`
 * confirms it, reuse it. Otherwise close any stale handle and reconnect once,
 * storing the fresh handle back into the entry.
 */
export async function validateOrReconnect(
  entry: PoolEntry,
  connect: () => Promise<McpClientHandle>,
  isHealthy: (h: McpClientHandle) => Promise<boolean>
): Promise<McpClientHandle> {
  if (entry.handle !== null && (await isHealthy(entry.handle))) return entry.handle;
  await closeEntry(entry);
  const handle = await connect();
  patchEntry(entry, { handle });
  return handle;
}
