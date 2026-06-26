import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import type { EvictionState } from './eviction.js';
import { evictState } from './eviction.js';
import { markUsed, newEntry } from './poolEntry.js';
import type { PoolEntry } from './poolKey.js';

export interface ConnectionPool {
  borrow: (key: string, connect: () => Promise<McpClientHandle>) => Promise<McpClientHandle>;
  borrowStdio: (key: string, connect: () => Promise<McpClientHandle>) => Promise<McpClientHandle>;
  release: (key: string) => void;
  evict: () => Promise<void>;
  size: () => number;
  has: (key: string) => boolean;
  entries: () => Map<string, PoolEntry>;
}

export interface ConnectionPoolOptions {
  maxEntries?: number;
  maxStdioEntries?: number;
  idleTtlMs?: number;
  /** Injectable clock seam; defaults to wall clock. Used by eviction + lastUsed. */
  now?: () => number;
}

const ONE = 1;
const ZERO = 0;

const DEFAULT_MAX_ENTRIES = 2_000;
const DEFAULT_MAX_STDIO_ENTRIES = 200;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1_000;
const DEFAULT_IDLE_TTL_MS = MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

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

function takeEntry(map: Map<string, PoolEntry>, key: string, isStdio: boolean): PoolEntry {
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const created = newEntry(isStdio);
  map.set(key, created);
  return created;
}

/**
 * Undo the refcount taken in `borrowWith` when the connect rejects. The caller
 * receives a rejected promise and will not call `release`, so without this the
 * entry would stay pinned at `borrows>0` (unusable AND un-evictable forever).
 * Drop the borrow and, if the entry is now a handle-less husk with no other
 * borrowers, remove it so a transient connect failure leaves no lingering slot.
 */
function unwindFailedBorrow(map: Map<string, PoolEntry>, key: string): void {
  const entry = map.get(key);
  if (entry === undefined) return;
  if (entry.borrows > ZERO) entry.borrows -= ONE;
  if (entry.handle === null && entry.borrows === ZERO) map.delete(key);
}

async function borrowWith(
  state: EvictionState,
  key: string,
  connect: () => Promise<McpClientHandle>,
  isStdio: boolean
): Promise<McpClientHandle> {
  const entry = takeEntry(state.map, key, isStdio);
  entry.borrows += ONE;
  markUsed(entry, state.now);
  try {
    return await connectInto(state.map, key, connect);
  } catch (error) {
    unwindFailedBorrow(state.map, key);
    throw error;
  }
}

function buildState(opts: ConnectionPoolOptions): EvictionState {
  return {
    map: new Map<string, PoolEntry>(),
    maxEntries: opts.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxStdioEntries: opts.maxStdioEntries ?? DEFAULT_MAX_STDIO_ENTRIES,
    idleTtlMs: opts.idleTtlMs ?? DEFAULT_IDLE_TTL_MS,
    now: opts.now ?? Date.now,
  };
}

/**
 * Backend-owned MCP connection pool. Adds TTL + LRU eviction (stdio capped
 * tighter than http), a `now` clock seam, and stdio-aware borrows on top of
 * the Task 1 borrow/return scaffold. Keepalive + reconnect-on-borrow live in
 * sibling modules (`keepalive.ts` / `poolEntry.ts`).
 */
export function createConnectionPool(opts: ConnectionPoolOptions = {}): ConnectionPool {
  const state = buildState(opts);
  return {
    entries: () => state.map,
    size: () => state.map.size,
    has: (key) => state.map.has(key),
    borrow: async (key, connect) => await borrowWith(state, key, connect, false),
    borrowStdio: async (key, connect) => await borrowWith(state, key, connect, true),
    release: (key) => {
      const entry = state.map.get(key);
      if (entry === undefined) return;
      if (entry.borrows > ZERO) entry.borrows -= ONE;
      markUsed(entry, state.now);
    },
    evict: async () => {
      await evictState(state);
    },
  };
}

export type { KeepaliveOptions } from './keepalive.js';
export { startKeepalive } from './keepalive.js';
