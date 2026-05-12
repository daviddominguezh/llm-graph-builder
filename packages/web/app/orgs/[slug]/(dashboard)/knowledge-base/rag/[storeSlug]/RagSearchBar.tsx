'use client';

import type { SearchMode } from '@/app/lib/ragFiles';
import { Input } from '@/components/ui/input';
import { CornerDownRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useState } from 'react';

interface RagSearchBarProps {
  query: string;
  mode: SearchMode;
  topK: number;
  minSimilarity: number;
  onQueryChange: (query: string) => void;
  onModeChange: (mode: SearchMode) => void;
  onTopKChange: (k: number) => void;
  onMinSimilarityChange: (s: number) => void;
}

const MODES: SearchMode[] = ['simple', 'semantic'];

const TOP_K_MIN = 1;
const TOP_K_MAX = 10;
const SIM_MIN = 0;
const SIM_MAX = 1;

const TAB_BASE =
  'cursor-pointer inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors border border-transparent';
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

interface SemanticControlsProps {
  topK: number;
  minSimilarity: number;
  onTopKChange: (k: number) => void;
  onMinSimilarityChange: (s: number) => void;
}

interface NumberFieldProps {
  value: number;
  min: number;
  max: number;
  round: boolean;
  onCommit: (next: number) => void;
  className?: string;
}

function NumberField({
  value,
  min,
  max,
  round,
  onCommit,
  className,
}: NumberFieldProps): React.JSX.Element {
  const [text, setText] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }

  function commit(): void {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) {
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

function SemanticControls({
  topK,
  minSimilarity,
  onTopKChange,
  onMinSimilarityChange,
}: SemanticControlsProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  return (
    <div className="flex items-center gap-9 pl-21 text-[10px] font-mono text-muted-foreground">
      <CornerDownRight className="size-3 shrink-0" aria-hidden="true" />
      <div className="flex items-center gap-4">
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
      </div>
    </div>
  );
}

export function RagSearchBar({
  query,
  mode,
  topK,
  minSimilarity,
  onQueryChange,
  onModeChange,
  onTopKChange,
  onMinSimilarityChange,
}: RagSearchBarProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ModeTabs mode={mode} onChange={onModeChange} />
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('placeholder')}
            className="pl-7"
          />
        </div>
      </div>
      {mode === 'semantic' && (
        <SemanticControls
          topK={topK}
          minSimilarity={minSimilarity}
          onTopKChange={onTopKChange}
          onMinSimilarityChange={onMinSimilarityChange}
        />
      )}
    </div>
  );
}
