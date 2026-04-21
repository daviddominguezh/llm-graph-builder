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
      await Promise.resolve();
    },
    get: async (id) => await Promise.resolve(map.get(id)),
    list: async () => await Promise.resolve([...map.values()].sort((a, b) => b.updatedAt - a.updatedAt)),
  };
}
