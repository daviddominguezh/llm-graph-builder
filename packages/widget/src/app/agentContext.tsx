import { type ReactNode, createContext, useContext } from 'react';

export interface AgentCtx {
  tenant: string;
  agentSlug: string;
  version: number;
}

const AgentContext = createContext<AgentCtx | null>(null);

export function AgentProvider({ value, children }: { value: AgentCtx; children: ReactNode }) {
  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent(): AgentCtx {
  const v = useContext(AgentContext);
  if (v === null) throw new Error('useAgent must be inside AgentProvider');
  return v;
}
