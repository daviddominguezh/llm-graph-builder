import { createInMemoryBackend } from './inMemory.js';
import type { StoredSession } from './indexeddb.js';
import { getSession, listSessions, openSessionsDB, putSession } from './indexeddb.js';

export interface SessionsBackend {
  kind: 'indexeddb' | 'memory';
  put: (s: StoredSession) => Promise<void>;
  get: (tenant: string, agentSlug: string, id: string) => Promise<StoredSession | undefined>;
  list: (tenant: string, agentSlug: string) => Promise<StoredSession[]>;
}

export async function createSessionsBackend(): Promise<SessionsBackend> {
  try {
    if (typeof globalThis.indexedDB === 'undefined') return createInMemoryBackend();
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
