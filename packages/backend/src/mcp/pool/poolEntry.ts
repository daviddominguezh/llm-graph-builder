import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import type { PoolEntry } from './poolKey.js';

const NO_BORROWS = 0;

export function newEntry(isStdio: boolean): PoolEntry {
  return { handle: null, lastUsed: Date.now(), borrows: NO_BORROWS, isStdio };
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
