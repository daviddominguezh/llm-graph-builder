'use client';

import type { TemplateCategory } from '@daviddh/graph-types';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { browseTemplatesAction, getTemplateVersionsAction } from '@/app/actions/templates';
import { useDebouncedValue } from '@/app/hooks/useDebouncedValue';
import type { TemplateListItem } from '@/app/lib/templates';

import { Search } from 'lucide-react';

import { BlankCanvasCard, TemplateCard } from './TemplateCard';
import { CategoryPills, SearchBar } from './TemplateGridFilters';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TemplateSelection {
  type: 'blank' | 'template';
  agentId?: string;
  version?: number;
}

interface TemplateGridProps {
  selection: TemplateSelection | null;
  onSelectionChange: (selection: TemplateSelection) => void;
  onPreview: (agentId: string, version: number) => void;
}

/* ------------------------------------------------------------------ */
/*  Fetchers (pure async, no React state)                              */
/* ------------------------------------------------------------------ */

interface FetchResult {
  templates: TemplateListItem[];
  versionEntries: ReadonlyArray<readonly [string, number[]]>;
}

async function fetchVersionEntry(tpl: TemplateListItem): Promise<readonly [string, number[]]> {
  const { versions } = await getTemplateVersionsAction(tpl.agent_id);
  return [tpl.agent_id, versions.map((v) => v.version)] as const;
}

async function fetchTemplatesAndVersions(search: string, category: string): Promise<FetchResult> {
  const params = {
    limit: 15,
    ...(search ? { search } : {}),
    ...(category ? { category } : {}),
  };
  const { templates } = await browseTemplatesAction(params);
  const versionEntries = await Promise.all(templates.map(fetchVersionEntry));
  return { templates, versionEntries };
}

/* ------------------------------------------------------------------ */
/*  State helpers                                                      */
/* ------------------------------------------------------------------ */

interface TemplateState {
  templates: TemplateListItem[];
  versionsMap: Record<string, number[]>;
  selectedVersions: Record<string, number>;
  loaded: boolean;
}

const INITIAL_STATE: TemplateState = { templates: [], versionsMap: {}, selectedVersions: {}, loaded: false };

function applyFetchResult(prev: TemplateState, result: FetchResult): TemplateState {
  const versionsMap = { ...prev.versionsMap };
  const selectedVersions = { ...prev.selectedVersions };
  for (const [agentId, nums] of result.versionEntries) {
    versionsMap[agentId] = nums;
    if (selectedVersions[agentId] === undefined && nums[0] !== undefined) {
      selectedVersions[agentId] = nums[0];
    }
  }
  return { templates: result.templates, versionsMap, selectedVersions, loaded: true };
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

function useTemplateData(search: string, category: TemplateCategory | '') {
  const [state, setState] = useState<TemplateState>(INITIAL_STATE);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void fetchTemplatesAndVersions(search, category).then((result) => {
      if (mountedRef.current) setState((prev) => applyFetchResult(prev, result));
    });
  }, [search, category]);

  const setSelectedVersion = useCallback((agentId: string, version: number) => {
    setState((prev) => ({
      ...prev,
      selectedVersions: { ...prev.selectedVersions, [agentId]: version },
    }));
  }, []);

  return { ...state, setSelectedVersion };
}

/* ------------------------------------------------------------------ */
/*  Grid content                                                       */
/* ------------------------------------------------------------------ */

interface GridContentProps {
  templates: TemplateListItem[];
  selection: TemplateSelection | null;
  versionsMap: Record<string, number[]>;
  selectedVersions: Record<string, number>;
  loaded: boolean;
  hasActiveFilter: boolean;
  onSelectBlank: () => void;
  onSelectTemplate: (agentId: string) => void;
  onVersionChange: (agentId: string, version: number) => void;
  onPreview: (agentId: string, version: number) => void;
  noResultsLabel: string;
  loadingLabel: string;
}

function GridContent(props: GridContentProps) {
  const { templates, selection, versionsMap, selectedVersions, loaded, hasActiveFilter } = props;
  const hasTemplates = templates.length > 0;
  const showBlank = !hasActiveFilter || hasTemplates;
  const showNoResults = !hasTemplates && loaded && hasActiveFilter;

  return (
    <div className="grid grid-cols-1 gap-3 max-h-[50vh] overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
      {showBlank && (
        <BlankCanvasCard selected={selection?.type === 'blank'} onSelect={props.onSelectBlank} />
      )}
      {hasTemplates
        ? templates.map((tpl) => (
            <TemplateCard
              key={tpl.agent_id}
              template={tpl}
              selected={selection?.type === 'template' && selection.agentId === tpl.agent_id}
              onSelect={() => props.onSelectTemplate(tpl.agent_id)}
              onPreview={() => props.onPreview(tpl.agent_id, selectedVersions[tpl.agent_id] ?? tpl.latest_version)}
              versions={versionsMap[tpl.agent_id] ?? [tpl.latest_version]}
              selectedVersion={selectedVersions[tpl.agent_id] ?? tpl.latest_version}
              onVersionChange={(v) => props.onVersionChange(tpl.agent_id, v)}
            />
          ))
        : null}
      {!hasTemplates && !loaded && (
        <p className="col-span-full py-8 text-center text-sm text-muted-foreground">{props.loadingLabel}</p>
      )}
      {showNoResults && (
        <div className="col-span-full flex flex-col items-center gap-2 py-10">
          <Search className="size-5 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{props.noResultsLabel}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TemplateGrid                                                       */
/* ------------------------------------------------------------------ */

export function TemplateGrid({ selection, onSelectionChange, onPreview }: TemplateGridProps) {
  const t = useTranslations('marketplace');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [category, setCategory] = useState<TemplateCategory | ''>('');
  const data = useTemplateData(debouncedSearch, category);
  const { templates, versionsMap, selectedVersions, setSelectedVersion } = data;

  const handleSelectBlank = useCallback(() => {
    onSelectionChange({ type: 'blank' });
  }, [onSelectionChange]);

  const handleSelectTemplate = useCallback(
    (agentId: string) => {
      const version = selectedVersions[agentId] ?? 1;
      onSelectionChange({ type: 'template', agentId, version });
    },
    [onSelectionChange, selectedVersions]
  );

  const handleVersionChange = useCallback(
    (agentId: string, version: number) => {
      setSelectedVersion(agentId, version);
      if (selection?.type === 'template' && selection.agentId === agentId) {
        onSelectionChange({ type: 'template', agentId, version });
      }
    },
    [selection, onSelectionChange, setSelectedVersion]
  );

  return (
    <div className="flex min-w-0 flex-col gap-3 overflow-hidden">
      <SearchBar value={search} onChange={setSearch} />
      <CategoryPills value={category} onChange={setCategory} />
      <GridContent
        templates={templates}
        selection={selection}
        versionsMap={versionsMap}
        selectedVersions={selectedVersions}
        loaded={data.loaded}
        hasActiveFilter={debouncedSearch !== '' || category !== ''}
        onSelectBlank={handleSelectBlank}
        onSelectTemplate={handleSelectTemplate}
        onVersionChange={handleVersionChange}
        onPreview={onPreview}
        noResultsLabel={t('noResults')}
        loadingLabel={tCommon('loading')}
      />
    </div>
  );
}
