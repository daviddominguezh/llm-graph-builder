'use client';

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from '@/components/ui/combobox';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { OpenRouterModel } from '../../../hooks/useOpenRouterModels';
import { SimulationThinkingEffort, type ThinkingEffort } from './SimulationThinkingEffort';

interface ModelGroup {
  value: string;
  items: string[];
}

function extractProvider(modelId: string): string {
  const slash = modelId.indexOf('/');
  return slash > 0 ? modelId.slice(0, slash) : modelId;
}

function extractShortName(modelId: string): string {
  const slash = modelId.indexOf('/');
  return slash > 0 ? modelId.slice(slash + 1) : modelId;
}

function buildGroups(models: OpenRouterModel[]): ModelGroup[] {
  const map = new Map<string, string[]>();
  for (const m of models) {
    const provider = extractProvider(m.id);
    const arr = map.get(provider) ?? [];
    arr.push(m.id);
    map.set(provider, arr);
  }
  return Array.from(map.entries())
    .map(([provider, ids]) => ({ value: provider, items: ids.sort() }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

interface SimulationModelSelectorProps {
  models: OpenRouterModel[];
  value: string;
  onValueChange: (value: string) => void;
  effort: ThinkingEffort;
  onEffortChange: (value: ThinkingEffort) => void;
}

export function SimulationModelSelector({ models, value, onValueChange, effort, onEffortChange }: SimulationModelSelectorProps) {
  const t = useTranslations('simulation');
  const groups = useMemo(() => buildGroups(models), [models]);
  const nameMap = useMemo(
    () => new Map(models.map((m) => [m.id, m.name.replace(/^[^:]+:\s*/, '')])),
    [models]
  );

  return (
    <Combobox
      items={groups}
      value={value}
      onValueChange={(v) => onValueChange(v ?? '')}
      itemToStringLabel={extractShortName}
    >
      <ComboboxInput
        placeholder={t('selectModel')}
        className="model-selector-trigger h-6 border-none bg-transparent text-[11px] text-muted-foreground shadow-none transition-colors rounded-md hover:bg-black/5 focus-within:bg-black/5"
        style={{ width: 'auto', flex: '0 0 auto', cursor: 'default', fieldSizing: 'content', boxShadow: 'none', borderColor: 'transparent' } as React.CSSProperties}
      />
      <ComboboxContent className="flex min-w-[280px] flex-col">
        <ComboboxEmpty>{t('noModelsFound')}</ComboboxEmpty>
        <ComboboxList className="flex-1">
          {(group) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel className="sticky -top-1 z-10 bg-popover font-semibold uppercase text-muted-foreground/60">{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(modelId) => (
                  <ComboboxItem key={modelId} value={modelId}>
                    {nameMap.get(modelId) ?? modelId}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
        <div className="shrink-0 border-t px-2 py-1.5">
          <SimulationThinkingEffort value={effort} onValueChange={onEffortChange} />
        </div>
      </ComboboxContent>
    </Combobox>
  );
}
