'use client';

import type { AgentMetadata } from '@/app/lib/agents';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

interface AgentsSidebarContextValue {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  agents: AgentMetadata[];
  syncAgents: (serverAgents: AgentMetadata[]) => void;
  touchAgent: (agentId: string) => void;
}

const AgentsSidebarContext = createContext<AgentsSidebarContextValue | null>(null);

const EMPTY_AGENTS: AgentMetadata[] = [];

export function AgentsSidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [agents, setAgents] = useState<AgentMetadata[]>(EMPTY_AGENTS);
  const prevServerRef = useRef<AgentMetadata[]>(EMPTY_AGENTS);

  const syncAgents = useCallback((serverAgents: AgentMetadata[]) => {
    if (serverAgents !== prevServerRef.current) {
      prevServerRef.current = serverAgents;
      setAgents(serverAgents);
    }
  }, []);

  const touchAgent = useCallback((agentId: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, updated_at: new Date().toISOString() } : a))
    );
  }, []);

  const value = useMemo(
    () => ({ collapsed, setCollapsed, agents, syncAgents, touchAgent }),
    [collapsed, agents, syncAgents, touchAgent]
  );

  return <AgentsSidebarContext.Provider value={value}>{children}</AgentsSidebarContext.Provider>;
}

export function useAgentsSidebar(): AgentsSidebarContextValue {
  const ctx = useContext(AgentsSidebarContext);
  if (!ctx) {
    return {
      collapsed: false,
      setCollapsed: () => {},
      agents: EMPTY_AGENTS,
      syncAgents: () => {},
      touchAgent: () => {},
    };
  }
  return ctx;
}
