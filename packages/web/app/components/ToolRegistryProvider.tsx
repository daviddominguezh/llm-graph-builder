'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import type { DiscoveredTool } from '../lib/api';
import { type RegistryTool, type ToolGroup, buildToolRegistry } from '../lib/toolRegistry';
import type { McpServerConfig } from '../schemas/graph.schema';

interface ToolRegistryValue {
  tools: RegistryTool[];
  groups: ToolGroup[];
}

const ToolRegistryContext = createContext<ToolRegistryValue | null>(null);

interface ToolRegistryProviderProps {
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
  children: ReactNode;
}

export function ToolRegistryProvider({ servers, discoveredTools, children }: ToolRegistryProviderProps) {
  const value = useMemo(() => buildToolRegistry(servers, discoveredTools), [servers, discoveredTools]);
  return <ToolRegistryContext.Provider value={value}>{children}</ToolRegistryContext.Provider>;
}

export function useToolRegistry(): ToolRegistryValue {
  const ctx = useContext(ToolRegistryContext);
  if (ctx === null) {
    throw new Error('useToolRegistry must be used within a ToolRegistryProvider');
  }
  return ctx;
}
