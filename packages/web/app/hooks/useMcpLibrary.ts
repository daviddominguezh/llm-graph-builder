import { useEffect, useMemo, useRef, useState } from 'react';

import type { McpLibraryRow } from '../lib/mcpLibraryTypes';

const LIBRARY_LIMIT = 30;

async function fetchLibrary(): Promise<McpLibraryRow[]> {
  const params = new URLSearchParams();
  params.set('limit', String(LIBRARY_LIMIT));
  const res = await fetch(`/api/mcp-library?${params.toString()}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { result?: McpLibraryRow[] };
  return data.result ?? [];
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
