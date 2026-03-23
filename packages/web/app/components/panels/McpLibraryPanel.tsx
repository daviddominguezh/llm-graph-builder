'use client';

import type { McpLibraryRow } from '@/app/lib/mcp-library-types';
import { Input } from '@/components/ui/input';
import { Separator } from '@base-ui/react';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import React from 'react';

import type { McpLibraryState } from '../../hooks/useMcpLibrary';
import { McpLibraryCard } from './McpLibraryCard';

interface McpLibraryPanelProps {
  library: McpLibraryState;
  installedLibraryIds: string[];
  onInstall: (item: McpLibraryRow) => void;
}

function LibraryPanelHeader() {
  const t = useTranslations('mcpLibrary');

  return (
    <div className="border-b px-4 py-3">
      <h2 className="text-sm font-semibold">{t('libraryTitle')}</h2>
    </div>
  );
}

function LibrarySearchBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
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

function filterItems(items: McpLibraryRow[], query: string): McpLibraryRow[] {
  if (query === '') return items;
  const lower = query.toLowerCase();
  return items.filter(
    (item) => item.name.toLowerCase().includes(lower) || item.description.toLowerCase().includes(lower)
  );
}

interface LibraryItemsListProps {
  items: McpLibraryRow[];
  loading: boolean;
  installedLibraryIds: string[];
  onInstall: (item: McpLibraryRow) => void;
}

function LibraryItemsList({ items, loading, installedLibraryIds, onInstall }: LibraryItemsListProps) {
  const t = useTranslations('mcpLibrary');

  if (loading) {
    return (
      <p className="px-4 py-3 text-xs text-muted-foreground bg-muted rounded-md mx-3 mt-1">
        {t('loading')}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-muted-foreground bg-muted rounded-md mx-3 mt-1">
        {t('noResults')}
      </p>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto gap-0 pb-4">
      {items.map((item, i) => (
        <React.Fragment key={item.id}>
          <McpLibraryCard
            key={`${item.id}-card`}
            item={item}
            isInstalled={installedLibraryIds.includes(item.id)}
            onInstall={onInstall}
          />
          {i < items.length - 1 && <Separator />}
        </React.Fragment>
      ))}
    </div>
  );
}

export function McpLibraryPanel({ library, installedLibraryIds, onInstall }: McpLibraryPanelProps) {
  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 300);
  }

  const filtered = useMemo(() => filterItems(library.items, debouncedQuery), [library.items, debouncedQuery]);

  return (
    <div className="w-[240px] absolute bottom-0 left-0 top-0 z-10 flex w-80 flex-col bg-background border-r rounded-e-md">
      <LibraryPanelHeader />
      <LibrarySearchBar value={query} onChange={handleQueryChange} />
      <LibraryItemsList
        items={filtered}
        loading={library.loading}
        installedLibraryIds={installedLibraryIds}
        onInstall={onInstall}
      />
    </div>
  );
}
