import type { ConnectionPool } from './connectionPool.js';
import type { PoolEntry } from './poolKey.js';

const NO_BORROWS = 0;

export interface KeepaliveOptions {
  intervalMs: number;
  jitterMs: number;
}

function isWarmIdle(entry: PoolEntry): boolean {
  return entry.borrows === NO_BORROWS && entry.handle !== null;
}

async function pingOne(entry: PoolEntry, ping: (entry: PoolEntry) => Promise<void>): Promise<void> {
  try {
    await ping(entry);
  } catch {
    // best-effort; lazy reconnect-on-borrow recovers the connection later.
  }
}

async function pingIdleEntries(
  pool: ConnectionPool,
  ping: (entry: PoolEntry) => Promise<void>
): Promise<void> {
  const pings: Array<Promise<void>> = [];
  for (const entry of pool.entries().values()) {
    if (isWarmIdle(entry)) pings.push(pingOne(entry, ping));
  }
  await Promise.all(pings);
}

/**
 * Periodic jittered ping over idle warm entries. Borrowed (in-flight) entries
 * are skipped so keepalive never races a live request. Returns a stop fn that
 * clears the timer. Wired by the route in a later RU2 task.
 */
export function startKeepalive(
  pool: ConnectionPool,
  ping: (entry: PoolEntry) => Promise<void>,
  opts: KeepaliveOptions
): () => void {
  const jitter = Math.floor(Math.random() * opts.jitterMs);
  const timer = setInterval(() => {
    void pingIdleEntries(pool, ping);
  }, opts.intervalMs + jitter);
  return () => {
    clearInterval(timer);
  };
}
