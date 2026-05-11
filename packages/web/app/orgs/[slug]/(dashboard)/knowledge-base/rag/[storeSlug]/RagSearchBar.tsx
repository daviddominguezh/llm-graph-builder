'use client';

import type { SearchMode } from '@/app/lib/ragFiles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

interface RagSearchBarProps {
  onSearch: (mode: SearchMode, query: string) => void;
  busy: boolean;
}

const MODES: SearchMode[] = ['simple', 'semantic'];

interface ModeTabsProps {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
}

function ModeTabs({ mode, onChange }: ModeTabsProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  return (
    <div className="flex gap-1 rounded-md border p-0.5">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`cursor-pointer px-2 py-1 text-[10px] font-mono rounded ${
            mode === m ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
          }`}
        >
          {t(`mode.${m}`)}
        </button>
      ))}
    </div>
  );
}

export function RagSearchBar({ onSearch, busy }: RagSearchBarProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  const [mode, setMode] = useState<SearchMode>('simple');
  const [query, setQuery] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (query.trim() === '') return;
    onSearch(mode, query.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <ModeTabs mode={mode} onChange={setMode} />
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('placeholder')}
          className="pl-7"
        />
      </div>
      <Button type="submit" size="sm" disabled={busy || query.trim() === ''}>
        {t('submit')}
      </Button>
    </form>
  );
}
