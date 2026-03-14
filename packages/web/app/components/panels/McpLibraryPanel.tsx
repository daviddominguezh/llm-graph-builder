'use client';

import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { McpLibraryRow } from '@/app/lib/mcp-library-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { McpLibraryCard } from './McpLibraryCard';

interface McpLibraryPanelProps {
  installedLibraryIds: string[];
  onInstall: (item: McpLibraryRow) => void;
  onClose: () => void;
}

async function fetchLibrary(query?: string): Promise<McpLibraryRow[]> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  params.set('limit', '15');
  const res = await fetch(`/api/mcp-library?${params.toString()}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { result?: McpLibraryRow[] };
  return data.result ?? [];
}

interface LibraryPanelHeaderProps {
  onClose: () => void;
}

function LibraryPanelHeader({ onClose }: LibraryPanelHeaderProps) {
  const t = useTranslations('mcpLibrary');

  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <h2 className="text-sm font-semibold">{t('libraryTitle')}</h2>
      <Button variant="ghost" size="icon-xs" onClick={onClose}>
        <X className="size-4" />
      </Button>
    </div>
  );
}

interface LibrarySearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

function LibrarySearchBar({ value, onChange }: LibrarySearchBarProps) {
  const t = useTranslations('mcpLibrary');

  return (
    <div className="relative px-3 py-2">
      <Search className="absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('searchPlaceholder')}
        className="pl-7 text-sm"
      />
    </div>
  );
}

interface LibraryItemsListProps {
  items: McpLibraryRow[];
  loading: boolean;
  query: string;
  installedLibraryIds: string[];
  onInstall: (item: McpLibraryRow) => void;
}

function LibraryItemsList({ items, loading, query, installedLibraryIds, onInstall }: LibraryItemsListProps) {
  const t = useTranslations('mcpLibrary');

  if (loading) {
    return <p className="px-4 py-3 text-xs text-muted-foreground bg-gray-100 rounded-md mx-3 mt-1">{t('loading')}</p>;
  }

  if (items.length === 0) {
    return <p className="px-4 py-3 text-xs text-muted-foreground bg-gray-100 rounded-md mx-3 mt-1">{t('noResults')}</p>;
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      {query === '' && (
        <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">{t('topInstalled')}</p>
      )}
      {items.map((item) => (
        <McpLibraryCard
          key={item.id}
          item={item}
          isInstalled={installedLibraryIds.includes(item.id)}
          onInstall={onInstall}
        />
      ))}
    </div>
  );
}

function useLibrarySearch() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<McpLibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runFetch = useCallback((term: string) => {
    Promise.resolve()
      .then(() => {
        setLoading(true);
        return fetchLibrary(term || undefined);
      })
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    runFetch(searchTerm);
  }, [runFetch, searchTerm]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchTerm(value), 300);
  }

  return { query, items, loading, handleQueryChange };
}

export function McpLibraryPanel({ installedLibraryIds, onInstall, onClose }: McpLibraryPanelProps) {
  const { query, items, loading, handleQueryChange } = useLibrarySearch();

  return (
    <div className="w-[240px] absolute bottom-0 left-0 top-0 z-10 flex w-80 flex-col bg-white border rounded-xl">
      <LibraryPanelHeader onClose={onClose} />
      <LibrarySearchBar value={query} onChange={handleQueryChange} />
      <LibraryItemsList
        items={items}
        loading={loading}
        query={query}
        installedLibraryIds={installedLibraryIds}
        onInstall={onInstall}
      />
    </div>
  );
}
