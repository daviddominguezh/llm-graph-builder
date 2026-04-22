import type { StoredSession } from './indexeddb.js';
import type { SessionsBackend } from './sessionsBackend.js';

export function createInMemoryBackend(): SessionsBackend {
  const map = new Map<string, StoredSession>();
  return {
    kind: 'memory',
    put: async (s) => {
      map.set(s.sessionId, s);
      await Promise.resolve();
    },
    get: async (tenant, agentSlug, id) => {
      await Promise.resolve();
      const s = map.get(id);
      if (s === undefined) return undefined;
      if (s.tenant !== tenant || s.agentSlug !== agentSlug) return undefined;
      return s;
    },
    list: async (tenant, agentSlug) => {
      await Promise.resolve();
      return [...map.values()]
        .filter((s) => s.tenant === tenant && s.agentSlug === agentSlug)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    delete: async (tenant, agentSlug, id) => {
      await Promise.resolve();
      const s = map.get(id);
      if (s === undefined) return;
      if (s.tenant !== tenant || s.agentSlug !== agentSlug) return;
      map.delete(id);
    },
  };
}
