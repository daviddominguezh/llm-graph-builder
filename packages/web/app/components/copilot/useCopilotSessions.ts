'use client';

import { useRef, useState } from 'react';

import type { CopilotMessage, CopilotPersistedState, CopilotSession } from './copilotTypes';

const MAX_SESSIONS = 50;
const TITLE_MAX_LENGTH = 40;

const EMPTY_STATE: CopilotPersistedState = { sessions: [], activeSessionId: null };

export interface UseCopilotSessionsReturn {
  sessions: CopilotSession[];
  activeSession: CopilotSession | null;
  createSession: () => string;
  switchSession: (id: string) => void;
  addMessage: (message: CopilotMessage) => void;
  updateLastMessage: (blocks: CopilotMessage['blocks']) => void;
}

// ---------------------------------------------------------------------------
// Pure session-mutation helpers
// ---------------------------------------------------------------------------

function buildNewSession(): CopilotSession {
  return { id: crypto.randomUUID(), title: '', messages: [], createdAt: Date.now() };
}

function trimOldestIfNeeded(sessions: CopilotSession[]): CopilotSession[] {
  if (sessions.length < MAX_SESSIONS) return sessions;
  return sessions.slice(sessions.length - MAX_SESSIONS + 1);
}

function deriveTitle(message: CopilotMessage, session: CopilotSession): string {
  if (session.messages.length !== 0 || message.role !== 'user') return session.title;
  const firstBlock = message.blocks[0];
  if (firstBlock?.type !== 'text') return session.title;
  return firstBlock.content.slice(0, TITLE_MAX_LENGTH);
}

function applyAddMessage(state: CopilotPersistedState, message: CopilotMessage): CopilotPersistedState {
  return {
    ...state,
    sessions: state.sessions.map((s) => {
      if (s.id !== state.activeSessionId) return s;
      return { ...s, title: deriveTitle(message, s), messages: [...s.messages, message] };
    }),
  };
}

function applyUpdateLastMessage(
  state: CopilotPersistedState,
  blocks: CopilotMessage['blocks']
): CopilotPersistedState {
  return {
    ...state,
    sessions: state.sessions.map((s) => {
      if (s.id !== state.activeSessionId) return s;
      const messages = s.messages.slice();
      const last = messages[messages.length - 1];
      if (!last) return s;
      messages[messages.length - 1] = { ...last, blocks };
      return { ...s, messages };
    }),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCopilotSessions(): UseCopilotSessionsReturn {
  const [state, setRawState] = useState<CopilotPersistedState>(EMPTY_STATE);
  const ref = useRef(state);

  function update(next: CopilotPersistedState): void {
    ref.current = next;
    setRawState(next);
  }

  function createSession(): string {
    const session = buildNewSession();
    const trimmed = trimOldestIfNeeded(ref.current.sessions);
    update({ sessions: [...trimmed, session], activeSessionId: session.id });
    return session.id;
  }

  function switchSession(id: string): void {
    update({ ...ref.current, activeSessionId: id });
  }

  function addMessage(message: CopilotMessage): void {
    update(applyAddMessage(ref.current, message));
  }

  function updateLastMessage(blocks: CopilotMessage['blocks']): void {
    update(applyUpdateLastMessage(ref.current, blocks));
  }

  const activeSession = state.sessions.find((s) => s.id === state.activeSessionId) ?? null;

  return {
    sessions: state.sessions,
    activeSession,
    createSession,
    switchSession,
    addMessage,
    updateLastMessage,
  };
}
