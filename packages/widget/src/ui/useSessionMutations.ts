import { useCallback } from 'react';

import type { StoredSession } from '../storage/indexeddb.js';
import type { SessionsBackend } from '../storage/sessionsBackend.js';

const EMPTY_LENGTH = 0;

export interface MutationArgs {
  backendRef: React.RefObject<Promise<SessionsBackend>>;
  tenant: string;
  agentSlug: string;
  reload: (b: SessionsBackend) => Promise<void>;
}

export interface DeleteArgs extends MutationArgs {
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
}

function shouldSkipRename(existing: StoredSession, trimmed: string): boolean {
  if (trimmed.length === EMPTY_LENGTH) return true;
  return existing.title === trimmed;
}

export function useRenameSession({
  backendRef,
  tenant,
  agentSlug,
  reload,
}: MutationArgs): (id: string, newTitle: string) => Promise<void> {
  return useCallback(
    async (id, newTitle) => {
      const trimmed = newTitle.trim();
      const b = await backendRef.current;
      const existing = await b.get(tenant, agentSlug, id);
      if (existing === undefined) return;
      if (shouldSkipRename(existing, trimmed)) return;
      const updated: StoredSession = { ...existing, title: trimmed, updatedAt: Date.now() };
      await b.put(updated);
      await reload(b);
    },
    [backendRef, tenant, agentSlug, reload]
  );
}

export function useDeleteSession({
  backendRef,
  tenant,
  agentSlug,
  reload,
  currentSessionId,
  setCurrentSessionId,
}: DeleteArgs): (id: string) => Promise<void> {
  return useCallback(
    async (id) => {
      const b = await backendRef.current;
      await b.delete(tenant, agentSlug, id);
      if (currentSessionId === id) setCurrentSessionId(null);
      await reload(b);
    },
    [backendRef, tenant, agentSlug, reload, currentSessionId, setCurrentSessionId]
  );
}

export function useToggleStarSession({
  backendRef,
  tenant,
  agentSlug,
  reload,
}: MutationArgs): (id: string) => Promise<void> {
  return useCallback(
    async (id) => {
      const b = await backendRef.current;
      const existing = await b.get(tenant, agentSlug, id);
      if (existing === undefined) return;
      const updated: StoredSession = { ...existing, starred: existing.starred !== true };
      await b.put(updated);
      await reload(b);
    },
    [backendRef, tenant, agentSlug, reload]
  );
}
