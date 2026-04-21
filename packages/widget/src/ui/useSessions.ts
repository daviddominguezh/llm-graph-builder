import { useCallback, useEffect, useRef, useState } from 'react';

import { randomUUID } from '../lib/uuid.js';
import type { StoredSession } from '../storage/indexeddb.js';
import { type SessionsBackend, createSessionsBackend } from '../storage/sessionsBackend.js';
import type { CopilotMessage, CopilotMessageBlock } from './copilotTypes.js';

interface Args {
  tenant: string;
  agentSlug: string;
}

interface UseSessionsResult {
  sessions: StoredSession[];
  currentSessionId: string | null;
  messages: CopilotMessage[];
  backendKind: 'indexeddb' | 'memory' | 'loading';
  createSession: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  appendUserMessage: (text: string) => Promise<void>;
  finalizeAssistantMessage: (blocks: CopilotMessageBlock[]) => Promise<void>;
}

interface SessionsState {
  backendRef: React.RefObject<Promise<SessionsBackend>>;
  backend: SessionsBackend | null;
  sessions: StoredSession[];
  currentSessionId: string | null;
  setSessions: (s: StoredSession[]) => void;
  setCurrentSessionId: (id: string | null) => void;
}

interface ScopeArgs {
  tenant: string;
  agentSlug: string;
}

const TITLE_MAX_LENGTH = 40;
const TITLE_TRIM_LENGTH = 37;
const EMPTY_LENGTH = 0;

function buildTitle(first: string): string {
  return first.length <= TITLE_MAX_LENGTH ? first : `${first.slice(EMPTY_LENGTH, TITLE_TRIM_LENGTH)}...`;
}

function buildUserMessage(text: string): CopilotMessage {
  return { id: randomUUID(), role: 'user', blocks: [{ type: 'text', content: text }], timestamp: Date.now() };
}

function buildAssistantMessage(blocks: CopilotMessageBlock[]): CopilotMessage {
  return { id: randomUUID(), role: 'assistant', blocks, timestamp: Date.now() };
}

function useSessionsState({ tenant, agentSlug }: ScopeArgs): SessionsState {
  const backendRef = useRef<Promise<SessionsBackend>>(createSessionsBackend());
  const [backend, setBackend] = useState<SessionsBackend | null>(null);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void backendRef.current.then(async (b) => {
      if (cancelled) return;
      setBackend(b);
      setSessions(await b.list(tenant, agentSlug));
    });
    return () => {
      cancelled = true;
    };
  }, [tenant, agentSlug]);

  return { backendRef, backend, sessions, currentSessionId, setSessions, setCurrentSessionId };
}

interface ActionArgs {
  state: SessionsState;
  tenant: string;
  agentSlug: string;
}

interface SessionActions {
  createSession: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  appendUserMessage: (text: string) => Promise<void>;
  finalizeAssistantMessage: (blocks: CopilotMessageBlock[]) => Promise<void>;
}

interface CreateSessionArgs {
  backendRef: React.RefObject<Promise<SessionsBackend>>;
  tenant: string;
  agentSlug: string;
  reload: (b: SessionsBackend) => Promise<void>;
  setCurrentSessionId: (id: string | null) => void;
}

function useCreateSession({
  backendRef,
  tenant,
  agentSlug,
  reload,
  setCurrentSessionId,
}: CreateSessionArgs): () => Promise<void> {
  return useCallback(async () => {
    const b = await backendRef.current;
    const now = Date.now();
    const session: StoredSession = {
      sessionId: randomUUID(),
      tenant,
      agentSlug,
      title: 'New chat',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await b.put(session);
    setCurrentSessionId(session.sessionId);
    await reload(b);
  }, [backendRef, tenant, agentSlug, reload, setCurrentSessionId]);
}

interface MutateArgs {
  backendRef: React.RefObject<Promise<SessionsBackend>>;
  currentSessionId: string | null;
  tenant: string;
  agentSlug: string;
  reload: (b: SessionsBackend) => Promise<void>;
}

function useAppendUserMessage({
  backendRef,
  currentSessionId,
  tenant,
  agentSlug,
  reload,
}: MutateArgs): (text: string) => Promise<void> {
  return useCallback(
    async (text: string) => {
      if (currentSessionId === null) return;
      const b = await backendRef.current;
      const existing = await b.get(tenant, agentSlug, currentSessionId);
      if (existing === undefined) return;
      const updated: StoredSession = {
        ...existing,
        title: existing.messages.length === EMPTY_LENGTH ? buildTitle(text) : existing.title,
        messages: [...existing.messages, buildUserMessage(text)],
        updatedAt: Date.now(),
      };
      await b.put(updated);
      await reload(b);
    },
    [backendRef, currentSessionId, tenant, agentSlug, reload]
  );
}

function useFinalizeAssistantMessage({
  backendRef,
  currentSessionId,
  tenant,
  agentSlug,
  reload,
}: MutateArgs): (blocks: CopilotMessageBlock[]) => Promise<void> {
  return useCallback(
    async (blocks: CopilotMessageBlock[]) => {
      if (currentSessionId === null) return;
      const b = await backendRef.current;
      const existing = await b.get(tenant, agentSlug, currentSessionId);
      if (existing === undefined) return;
      const updated: StoredSession = {
        ...existing,
        messages: [...existing.messages, buildAssistantMessage(blocks)],
        updatedAt: Date.now(),
      };
      await b.put(updated);
      await reload(b);
    },
    [backendRef, currentSessionId, tenant, agentSlug, reload]
  );
}

function useSessionActions({ state, tenant, agentSlug }: ActionArgs): SessionActions {
  const { backendRef, currentSessionId, setSessions, setCurrentSessionId } = state;

  const reload = useCallback(
    async (b: SessionsBackend) => {
      setSessions(await b.list(tenant, agentSlug));
    },
    [setSessions, tenant, agentSlug]
  );

  const createSession = useCreateSession({ backendRef, tenant, agentSlug, reload, setCurrentSessionId });

  const switchSession = useCallback(
    async (id: string) => {
      const b = await backendRef.current;
      const s = await b.get(tenant, agentSlug, id);
      if (s !== undefined) setCurrentSessionId(s.sessionId);
    },
    [backendRef, tenant, agentSlug, setCurrentSessionId]
  );

  const mutateArgs = { backendRef, currentSessionId, tenant, agentSlug, reload };
  const appendUserMessage = useAppendUserMessage(mutateArgs);
  const finalizeAssistantMessage = useFinalizeAssistantMessage(mutateArgs);

  return { createSession, switchSession, appendUserMessage, finalizeAssistantMessage };
}

export function useSessions({ tenant, agentSlug }: Args): UseSessionsResult {
  const state = useSessionsState({ tenant, agentSlug });
  const actions = useSessionActions({ state, tenant, agentSlug });

  const current = state.sessions.find((s) => s.sessionId === state.currentSessionId);
  const messages = current?.messages ?? [];
  const backendKind: UseSessionsResult['backendKind'] =
    state.backend === null ? 'loading' : state.backend.kind;

  return {
    sessions: state.sessions,
    currentSessionId: state.currentSessionId,
    messages,
    backendKind,
    ...actions,
  };
}
