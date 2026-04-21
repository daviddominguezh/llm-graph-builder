import type { StoredSession } from './indexeddb.js';

export function createInMemoryBackend(): {
  kind: 'memory';
  put: (s: StoredSession) => Promise<void>;
  get: (id: string) => Promise<StoredSession | undefined>;
  list: () => Promise<StoredSession[]>;
} {
  const map = new Map<string, StoredSession>();
  return {
    kind: 'memory',
    put: async (s) => {
      map.set(s.sessionId, s);
    },
    get: async (id) => map.get(id),
    list: async () => [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt),
  };
}
