import { useEffect, useMemo, useRef, useState } from 'react';

import type { TemplateListItem } from '../lib/templates';

const TEMPLATE_LIMIT = 30;

function isTemplateItem(value: unknown): value is TemplateListItem {
  return typeof value === 'object' && value !== null && 'agent_id' in value && 'org_slug' in value;
}

function parseTemplateRows(data: unknown): TemplateListItem[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isTemplateItem);
}

async function fetchTopTemplates(): Promise<TemplateListItem[]> {
  const params = new URLSearchParams();
  params.set('limit', String(TEMPLATE_LIMIT));
  params.set('sort', 'downloads');
  const res = await fetch(`/api/templates?${params.toString()}`);
  if (!res.ok) return [];
  const data: unknown = await res.json();
  return parseTemplateRows(data);
}

export interface TemplatesPrefetchState {
  items: TemplateListItem[];
  loading: boolean;
}

export function useTemplatesPrefetch(): TemplatesPrefetchState {
  const [items, setItems] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    void fetchTopTemplates()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return useMemo(() => ({ items, loading }), [items, loading]);
}
