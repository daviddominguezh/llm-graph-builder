import type { StoredSession } from './indexeddb.js';
import { getSession, listSessions, openSessionsDB, putSession } from './indexeddb.js';
import { createInMemoryBackend } from './inMemory.js';

export type SessionsBackend = {
  kind: 'indexeddb' | 'memory';
  put: (s: StoredSession) => Promise<void>;
  get: (id: string) => Promise<StoredSession | undefined>;
  list: () => Promise<StoredSession[]>;
};

export async function createSessionsBackend(): Promise<SessionsBackend> {
  try {
    if (typeof globalThis.indexedDB === 'undefined') return createInMemoryBackend();
    // Probe — opens the DB and immediately closes.
    const db = await openSessionsDB();
    db.close();
    return {
      kind: 'indexeddb',
      put: putSession,
      get: getSession,
      list: listSessions,
    };
  } catch {
    return createInMemoryBackend();
  }
}
