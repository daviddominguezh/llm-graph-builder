'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { McpLibraryRow } from '../lib/mcpLibraryTypes';

const McpLibraryContext = createContext<McpLibraryRow[] | null>(null);

interface McpLibraryProviderProps {
  items: McpLibraryRow[];
  children: ReactNode;
}

export function McpLibraryProvider({ items, children }: McpLibraryProviderProps): React.JSX.Element {
  return <McpLibraryContext.Provider value={items}>{children}</McpLibraryContext.Provider>;
}

// Non-throwing: returns [] when rendered outside a provider (e.g. DebugCanvas).
export function useMcpLibraryItems(): McpLibraryRow[] {
  return useContext(McpLibraryContext) ?? [];
}
