'use client';

import { createContext, useContext, useMemo, useState } from 'react';

import type { CopilotSession } from './copilotTypes';
import { useCopilotSessions } from './useCopilotSessions';
import { useCopilotStreaming } from './useCopilotStreaming';
import { CopilotButton } from './CopilotButton';
import { CopilotPanel } from './CopilotPanel';

// ---------------------------------------------------------------------------
// Context interface
// ---------------------------------------------------------------------------

export interface CopilotContextValue {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  sessions: CopilotSession[];
  activeSession: CopilotSession | null;
  createSession: () => string;
  switchSession: (id: string) => void;
  sendMessage: (text: string) => void;
  stopStreaming: () => void;
  isStreaming: boolean;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function useCopilotContext(): CopilotContextValue {
  const ctx = useContext(CopilotContext);
  if (ctx === null) {
    throw new Error('useCopilotContext must be used within a CopilotProvider');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const sessions = useCopilotSessions();
  const streaming = useCopilotStreaming(sessions.addMessage, sessions.updateLastMessage);

  const value = useMemo<CopilotContextValue>(
    () => ({
      isOpen,
      setOpen,
      sessions: sessions.sessions,
      activeSession: sessions.activeSession,
      createSession: sessions.createSession,
      switchSession: sessions.switchSession,
      sendMessage: streaming.startStreaming,
      stopStreaming: streaming.stopStreaming,
      isStreaming: streaming.isStreaming,
    }),
    [isOpen, sessions, streaming]
  );

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function CopilotShell({ children }: { children: React.ReactNode }) {
  return (
    <CopilotProvider>
      {children}
      <CopilotButton />
      <CopilotPanel />
    </CopilotProvider>
  );
}
