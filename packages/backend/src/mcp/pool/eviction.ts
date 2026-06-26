import { closeEntry } from './poolEntry.js';
import type { PoolEntry } from './poolKey.js';

const NO_BORROWS = 0;
const KEY_INDEX = 0;

/** Runtime knobs an eviction pass reads. The `map` is the live pool store. */
export interface EvictionState {
  map: Map<string, PoolEntry>;
  maxEntries: number;
  maxStdioEntries: number;
  idleTtlMs: number;
  now: () => number;
}

/** Idle-TTL expiry: only free (unborrowed) entries past their idle window qualify. */
function isIdleExpired(entry: PoolEntry, state: EvictionState): boolean {
  if (entry.borrows > NO_BORROWS) return false;
  return state.now() - entry.lastUsed > state.idleTtlMs;
}

/** Append the LRU-ordered overflow victims of one transport group to `out`. */
function collectOverflow(group: Array<[string, PoolEntry]>, cap: number, out: Set<string>): void {
  const overflow = group.length - cap;
  if (overflow <= NO_BORROWS) return;
  const free = group
    .filter(([, entry]) => entry.borrows === NO_BORROWS)
    .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
  for (const victim of free.slice(NO_BORROWS, overflow)) {
    out.add(victim[KEY_INDEX]);
  }
}

/** LRU victims for entries above the stdio / http caps (stdio capped tighter). */
function overCapKeys(state: EvictionState): Set<string> {
  const stdio: Array<[string, PoolEntry]> = [];
  const http: Array<[string, PoolEntry]> = [];
  for (const pair of state.map) {
    const [, entry] = pair;
    (entry.isStdio ? stdio : http).push(pair);
  }
  const victims = new Set<string>();
  collectOverflow(stdio, state.maxStdioEntries, victims);
  collectOverflow(http, state.maxEntries, victims);
  return victims;
}

/** Union of idle-expired and over-cap victims, both excluding borrowed entries. */
function collectVictims(state: EvictionState): Set<string> {
  const victims = new Set<string>();
  for (const [key, entry] of state.map) {
    if (isIdleExpired(entry, state)) victims.add(key);
  }
  for (const key of overCapKeys(state)) victims.add(key);
  return victims;
}

/** Detach an evictable entry from the map, returning its close promise (or null). */
function detachVictim(state: EvictionState, key: string): Promise<void> | null {
  const entry = state.map.get(key);
  if (entry === undefined || entry.borrows > NO_BORROWS) return null;
  state.map.delete(key);
  return closeEntry(entry);
}

/** TTL + LRU eviction pass. Never evicts a borrowed (in-flight) entry. */
export async function evictState(state: EvictionState): Promise<void> {
  const closing: Array<Promise<void>> = [];
  for (const key of collectVictims(state)) {
    const pending = detachVictim(state, key);
    if (pending !== null) closing.push(pending);
  }
  await Promise.all(closing);
}
