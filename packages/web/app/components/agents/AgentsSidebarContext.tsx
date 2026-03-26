'use client';

import { createContext, useContext, useMemo, useState } from 'react';

interface AgentsSidebarContextValue {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const AgentsSidebarContext = createContext<AgentsSidebarContextValue | null>(null);

export function AgentsSidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const value = useMemo(() => ({ collapsed, setCollapsed }), [collapsed]);

  return <AgentsSidebarContext.Provider value={value}>{children}</AgentsSidebarContext.Provider>;
}

export function useAgentsSidebar(): AgentsSidebarContextValue {
  const ctx = useContext(AgentsSidebarContext);
  if (!ctx) {
    return { collapsed: false, setCollapsed: () => {} };
  }
  return ctx;
}
