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

const TAB_BASE =
  'cursor-pointer inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors border border-transparent';
const TAB_ACTIVE = 'bg-popover dark:bg-input text-foreground shadow-sm';
const TAB_INACTIVE =
  'text-muted-foreground hover:text-foreground border-transparent hover:bg-input dark:hover:bg-card';

interface ModeTabsProps {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
}

function ModeTabs({ mode, onChange }: ModeTabsProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  return (
    <div className="inline-flex gap-1 dark:gap-0.5 rounded-sm border bg-muted/50 p-0.5">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`${TAB_BASE} ${m === mode ? TAB_ACTIVE : TAB_INACTIVE}`}
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
