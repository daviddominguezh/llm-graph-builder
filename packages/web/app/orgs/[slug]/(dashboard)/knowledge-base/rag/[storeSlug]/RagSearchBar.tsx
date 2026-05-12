'use client';

import type { SearchMode } from '@/app/lib/ragFiles';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Loader2, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useState } from 'react';

interface RagSearchBarProps {
  query: string;
  mode: SearchMode;
  topK: number;
  minSimilarity: number;
  rerank: boolean;
  isSearching: boolean;
  canClear: boolean;
  onQueryChange: (query: string) => void;
  onModeChange: (mode: SearchMode) => void;
  onTopKChange: (k: number) => void;
  onMinSimilarityChange: (s: number) => void;
  onRerankChange: (enabled: boolean) => void;
  onSubmit: () => void;
  onClear: () => void;
}

const RERANK_MIN_K = 5;

const MODES: SearchMode[] = ['simple', 'semantic', 'hybrid'];

const TOP_K_MIN = 1;
const TOP_K_MAX = 10;
const SIM_MIN = 0;
const SIM_MAX = 1;

const TAB_BASE =
  'cursor-pointer inline-flex min-w-[65px] items-center justify-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors border border-transparent';
const TAB_ACTIVE = 'bg-popover dark:bg-input text-foreground shadow-sm';
const TAB_INACTIVE =
  'text-muted-foreground hover:text-foreground border-transparent hover:bg-input dark:hover:bg-card';
const NUMBER_INPUT_CLASS = 'h-6 px-1.5 py-0 text-[10px] font-mono';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, value), max);
}

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

interface SearchControlsProps {
  mode: SearchMode;
  topK: number;
  minSimilarity: number;
  rerank: boolean;
  isSearching: boolean;
  canClear: boolean;
  hasQuery: boolean;
  onTopKChange: (k: number) => void;
  onMinSimilarityChange: (s: number) => void;
  onRerankChange: (enabled: boolean) => void;
  onSubmit: () => void;
  onClear: () => void;
}

interface NumberFieldProps {
  value: number;
  min: number;
  max: number;
  round: boolean;
  onCommit: (next: number) => void;
  className?: string;
}

function NumberField({ value, min, max, round, onCommit, className }: NumberFieldProps): React.JSX.Element {
  const [text, setText] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }

  function commit(): void {
    const normalized = text.trim().replace(',', '.');
    const n = Number(normalized);
    if (normalized === '' || !Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    const clamped = clamp(round ? Math.round(n) : n, min, max);
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setText(String(value));
      e.currentTarget.blur();
    }
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={className}
    />
  );
}

interface TopKFieldProps {
  topK: number;
  onTopKChange: (k: number) => void;
}

function TopKField({ topK, onTopKChange }: TopKFieldProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  return (
    <label className="flex items-center gap-1.5">
      <span>{t('topKLabel')}</span>
      <NumberField
        value={topK}
        min={TOP_K_MIN}
        max={TOP_K_MAX}
        round
        onCommit={onTopKChange}
        className={`${NUMBER_INPUT_CLASS} w-14`}
      />
    </label>
  );
}

interface MinSimFieldProps {
  minSimilarity: number;
  onMinSimilarityChange: (s: number) => void;
}

function MinSimField({ minSimilarity, onMinSimilarityChange }: MinSimFieldProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  return (
    <label className="flex items-center gap-1.5">
      <span>{t('minSimilarityLabel')}</span>
      <NumberField
        value={minSimilarity}
        min={SIM_MIN}
        max={SIM_MAX}
        round={false}
        onCommit={onMinSimilarityChange}
        className={`${NUMBER_INPUT_CLASS} w-16`}
      />
    </label>
  );
}

interface RerankToggleProps {
  rerank: boolean;
  rerankAvailable: boolean;
  forced: boolean;
  onRerankChange: (enabled: boolean) => void;
}

function RerankToggle({
  rerank,
  rerankAvailable,
  forced,
  onRerankChange,
}: RerankToggleProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  const checked = forced ? true : rerank && rerankAvailable;
  const dimmed = !forced && !rerankAvailable;
  const labelClass = forced
    ? 'flex items-center gap-1.5 pointer-events-none select-none'
    : 'flex items-center gap-1.5';
  return (
    <div className={`flex items-center gap-1.5 ${dimmed ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <label className={labelClass}>
        <Checkbox
          checked={checked}
          disabled={!forced && !rerankAvailable}
          onCheckedChange={(v) => onRerankChange(v === true)}
        />
        <span>{t('rerankLabel')}</span>
      </label>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={t('rerankTooltip')}
          className="cursor-help text-muted-foreground hover:text-foreground"
        >
          <Info className="size-3" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{t('rerankTooltip')}</TooltipContent>
      </Tooltip>
    </div>
  );
}

interface SearchActionsProps {
  isSearching: boolean;
  canClear: boolean;
  hasQuery: boolean;
  onSubmit: () => void;
  onClear: () => void;
}

function SearchActions({
  isSearching,
  canClear,
  hasQuery,
  onSubmit,
  onClear,
}: SearchActionsProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  return (
    <div className="ml-auto flex items-center gap-1 font-sans">
      {canClear && (
        <Button size="sm" variant="ghost" onClick={onClear} type="button" className="rounded-md">
          <X />
          <span>{t('clear')}</span>
        </Button>
      )}
      <Button size="sm" onClick={onSubmit} type="button" disabled={!hasQuery || isSearching}>
        {isSearching ? <Loader2 className="animate-spin" /> : <Search />}
        <span>{t('submit')}</span>
      </Button>
    </div>
  );
}

function SearchControls(props: SearchControlsProps): React.JSX.Element {
  const rerankAvailable = props.topK >= RERANK_MIN_K;
  const showMinSim = props.mode === 'semantic' || props.mode === 'hybrid';
  const showRerankToggle = props.mode === 'semantic' || props.mode === 'hybrid';
  const rerankForced = props.mode === 'hybrid';
  return (
    <div className="flex flex-1 items-center gap-4 text-[10px] font-mono text-muted-foreground pl-1">
      <TopKField topK={props.topK} onTopKChange={props.onTopKChange} />
      {showMinSim && (
        <MinSimField
          minSimilarity={props.minSimilarity}
          onMinSimilarityChange={props.onMinSimilarityChange}
        />
      )}
      {showRerankToggle && (
        <RerankToggle
          rerank={props.rerank}
          rerankAvailable={rerankAvailable}
          forced={rerankForced}
          onRerankChange={props.onRerankChange}
        />
      )}
      <SearchActions
        isSearching={props.isSearching}
        canClear={props.canClear}
        hasQuery={props.hasQuery}
        onSubmit={props.onSubmit}
        onClear={props.onClear}
      />
    </div>
  );
}

function ModeExplanation({ mode }: { mode: SearchMode }): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  return (
    <div className="top-[100%] mt-1.5 border-l-2 ml-[1px] absolute w-full text-[10px] leading-tight text-muted-foreground px-1.5">
      {t(`description.${mode}`)}
    </div>
  );
}

interface QueryInputProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSubmit: () => void;
}

function QueryInput({ query, onQueryChange, onSubmit }: QueryInputProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    }
  }
  return (
    <div className="relative flex-1">
      <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('placeholder')}
        className="pl-7"
      />
    </div>
  );
}

export function RagSearchBar(props: RagSearchBarProps): React.JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <div className="relative flex shrink-0 flex-col gap-2">
        <ModeTabs mode={props.mode} onChange={props.onModeChange} />
        <ModeExplanation mode={props.mode} />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <QueryInput query={props.query} onQueryChange={props.onQueryChange} onSubmit={props.onSubmit} />
        <SearchControls
          mode={props.mode}
          topK={props.topK}
          minSimilarity={props.minSimilarity}
          rerank={props.rerank}
          isSearching={props.isSearching}
          canClear={props.canClear}
          hasQuery={props.query.trim() !== ''}
          onTopKChange={props.onTopKChange}
          onMinSimilarityChange={props.onMinSimilarityChange}
          onRerankChange={props.onRerankChange}
          onSubmit={props.onSubmit}
          onClear={props.onClear}
        />
      </div>
    </div>
  );
}
