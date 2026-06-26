import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import { newEntry } from './poolEntry.js';
import type { PoolEntry } from './poolKey.js';

export interface ConnectionPool {
  borrow: (key: string, connect: () => Promise<McpClientHandle>) => Promise<McpClientHandle>;
  release: (key: string) => void;
  size: () => number;
  has: (key: string) => boolean;
  entries: () => Map<string, PoolEntry>;
}

export interface ConnectionPoolOptions {
  maxEntries?: number;
  maxStdioEntries?: number;
}

const ONE = 1;
const ZERO = 0;

/**
 * Build the shared `connecting` promise. Success stores the handle back into
 * the map entry; failure clears `connecting` so a later borrow can retry.
 * Both run in synchronous callbacks (no `await` boundary) so concurrent
 * borrows connect only once and there is no atomic-update hazard.
 */
async function buildConnecting(
  map: Map<string, PoolEntry>,
  key: string,
  connect: () => Promise<McpClientHandle>
): Promise<McpClientHandle> {
  return await connect().then(
    (handle) => {
      const settled = map.get(key);
      if (settled !== undefined) {
        settled.handle = handle;
        settled.connecting = undefined;
      }
      return handle;
    },
    (error: unknown) => {
      const failed = map.get(key);
      if (failed !== undefined) failed.connecting = undefined;
      throw error;
    }
  );
}

async function connectInto(
  map: Map<string, PoolEntry>,
  key: string,
  connect: () => Promise<McpClientHandle>
): Promise<McpClientHandle> {
  const entry = map.get(key);
  if (entry === undefined) throw new Error(`pool entry missing for key: ${key}`);
  if (entry.handle !== null) return entry.handle;
  entry.connecting ??= buildConnecting(map, key, connect);
  return await entry.connecting;
}

function takeEntry(map: Map<string, PoolEntry>, key: string): PoolEntry {
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const created = newEntry(false);
  map.set(key, created);
  return created;
}

/**
 * Backend-owned MCP connection pool. `opts` (maxEntries / maxStdioEntries) is
 * accepted now to keep the constructor signature stable; eviction/keepalive
 * that consume those limits are added by later RU2 tasks.
 */
export function createConnectionPool(opts: ConnectionPoolOptions = {}): ConnectionPool {
  const map = new Map<string, PoolEntry>();
  return {
    entries: () => map,
    size: () => map.size,
    has: (key) => map.has(key),
    borrow: async (key, connect) => {
      const entry = takeEntry(map, key);
      entry.borrows += ONE;
      entry.lastUsed = Date.now();
      return await connectInto(map, key, connect);
    },
    release: (key) => {
      const entry = map.get(key);
      if (entry === undefined) return;
      if (entry.borrows > ZERO) entry.borrows -= ONE;
      entry.lastUsed = Date.now();
    },
  };
}
