'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import { type RegistryState, useAgentRegistry } from '../hooks/useAgentRegistry';
import type { RegistryTool, ToolGroup } from '../lib/toolRegistryTypes';

interface ToolRegistryValue {
  tools: RegistryTool[];
  groups: ToolGroup[];
  state: RegistryState;
}

const ToolRegistryContext = createContext<ToolRegistryValue | null>(null);

interface ToolRegistryProviderProps {
  agentId: string;
  children: ReactNode;
}

function deriveValue(state: RegistryState): ToolRegistryValue {
  if (state.kind === 'loaded' || state.kind === 'partial-failure') {
    return { tools: state.tools, groups: state.groups, state };
  }
  return { tools: [], groups: [], state };
}

export function ToolRegistryProvider({
  agentId,
  children,
}: ToolRegistryProviderProps): React.JSX.Element {
  const state = useAgentRegistry(agentId);
  const value = useMemo(() => deriveValue(state), [state]);
  return <ToolRegistryContext.Provider value={value}>{children}</ToolRegistryContext.Provider>;
}

export function useToolRegistry(): ToolRegistryValue {
  const ctx = useContext(ToolRegistryContext);
  if (ctx === null) {
    throw new Error('useToolRegistry must be used within a ToolRegistryProvider');
  }
  return ctx;
}
