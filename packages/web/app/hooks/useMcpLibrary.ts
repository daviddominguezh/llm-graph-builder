import { useEffect, useMemo, useRef, useState } from 'react';

import { type McpLibraryRow, isLibraryRow } from '../lib/mcpLibraryTypes';

const LIBRARY_LIMIT = 30;

function parseLibraryRows(data: unknown): McpLibraryRow[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isLibraryRow);
}

async function fetchLibrary(): Promise<McpLibraryRow[]> {
  const params = new URLSearchParams();
  params.set('limit', String(LIBRARY_LIMIT));
  const res = await fetch(`/api/mcp-library?${params.toString()}`);
  if (!res.ok) return [];
  const data: unknown = await res.json();
  return parseLibraryRows(data);
}

export interface McpLibraryState {
  items: McpLibraryRow[];
  loading: boolean;
}

export function useMcpLibrary(): McpLibraryState {
  const [items, setItems] = useState<McpLibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    void fetchLibrary()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return useMemo(() => ({ items, loading }), [items, loading]);
}
