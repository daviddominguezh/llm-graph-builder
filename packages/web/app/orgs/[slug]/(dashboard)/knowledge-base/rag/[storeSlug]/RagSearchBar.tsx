'use client';

import type { SearchMode } from '@/app/lib/ragFiles';
import { Input } from '@/components/ui/input';
import { CornerDownRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
const TOP_K_MAX = 50;
const SIM_MIN = 0;
const SIM_MAX = 1;
const SIM_STEP = 0.05;

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

function handleNumber(
  raw: string,
  min: number,
  max: number,
  apply: (n: number) => void,
  round: boolean
): void {
  if (raw === '') return;
  const n = Number(raw);
  if (!Number.isFinite(n)) return;
  apply(clamp(round ? Math.round(n) : n, min, max));
}

function SemanticControls({
  topK,
  minSimilarity,
  onTopKChange,
  onMinSimilarityChange,
}: SemanticControlsProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  return (
    <div className="flex items-center gap-4 pl-2 text-[10px] font-mono text-muted-foreground">
      <CornerDownRight className="size-3 shrink-0" aria-hidden="true" />
      <label className="flex items-center gap-1.5">
        <span>{t('topKLabel')}</span>
        <Input
          type="number"
          min={TOP_K_MIN}
          max={TOP_K_MAX}
          step={1}
          value={topK}
          onChange={(e) => handleNumber(e.target.value, TOP_K_MIN, TOP_K_MAX, onTopKChange, true)}
          className={`${NUMBER_INPUT_CLASS} w-14`}
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span>{t('minSimilarityLabel')}</span>
        <Input
          type="number"
          min={SIM_MIN}
          max={SIM_MAX}
          step={SIM_STEP}
          value={minSimilarity}
          onChange={(e) =>
            handleNumber(e.target.value, SIM_MIN, SIM_MAX, onMinSimilarityChange, false)
          }
          className={`${NUMBER_INPUT_CLASS} w-16`}
        />
      </label>
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
