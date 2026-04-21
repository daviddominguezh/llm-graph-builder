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
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRef, useMemo } from 'react';

import type { OpenRouterModel } from '../../../hooks/useOpenRouterModels';
import { SimulationThinkingEffort, type ThinkingEffort } from './SimulationThinkingEffort';

interface ProviderIcon {
  url: string;
  className?: string;
}

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

function buildIconMap(models: OpenRouterModel[]): Map<string, ProviderIcon> {
  const map = new Map<string, ProviderIcon>();
  for (const m of models) {
    if (m.providerIcon === undefined) continue;
    const provider = extractProvider(m.id);
    if (map.has(provider)) continue;
    map.set(provider, m.providerIcon);
  }
  return map;
}

function ProviderImg({ icon, size = 14 }: { icon: ProviderIcon; size?: number }) {
  return (
    <Image
      src={icon.url}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-sm ${icon.className ?? ''}`}
      unoptimized
    />
  );
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
  const iconMap = useMemo(() => buildIconMap(models), [models]);
  const nameMap = useMemo(
    () => new Map(models.map((m) => [m.id, m.name.replace(/^[^:]+:\s*/, '')])),
    [models]
  );
  const openRef = useRef(false);
  const anchorRef = useComboboxAnchor();

  return (
    <Combobox
      items={groups}
      value={value}
      onValueChange={(v) => onValueChange(v ?? '')}
      itemToStringLabel={extractShortName}
      onOpenChange={(open) => { openRef.current = open; }}
    >
      <div ref={anchorRef}>
        <ComboboxInput
          placeholder={t('selectModel')}
          className="model-selector-trigger h-6 border-none bg-transparent! text-[11px] text-muted-foreground shadow-none transition-colors rounded-md hover:bg-background! focus-within:bg-background!"
          style={{ width: 'auto', flex: '0 0 auto', cursor: 'default', fieldSizing: 'content', boxShadow: 'none', borderColor: 'transparent' } as React.CSSProperties}
        >
          {effort === 'high' && (
            <span
              className="shrink-0 cursor-default text-[11px] text-muted-foreground/60"
              onMouseDown={(e) => {
                e.preventDefault();
                if (!openRef.current) {
                  (e.currentTarget.parentElement?.querySelector('button') as HTMLButtonElement | null)?.click();
                }
              }}
            >
              Thinking
            </span>
          )}
        </ComboboxInput>
      </div>
      <ComboboxContent className="flex w-[280px] flex-col" align="end" anchor={anchorRef}>
        <ComboboxEmpty>{t('noModelsFound')}</ComboboxEmpty>
        <ComboboxList className="flex-1">
          {(group) => {
            const icon = iconMap.get(group.value);
            return (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel className="sticky -top-1 z-10 flex items-center gap-1.5 bg-popover font-semibold uppercase text-muted-foreground/60">
                  {icon !== undefined && <ProviderImg icon={icon} size={12} />}
                  {group.value}
                </ComboboxLabel>
                <ComboboxCollection>
                  {(modelId) => (
                    <ComboboxItem key={modelId} value={modelId}>
                      {nameMap.get(modelId) ?? modelId}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            );
          }}
        </ComboboxList>
        <div className="shrink-0 border-t px-2 py-1.5">
          <SimulationThinkingEffort value={effort} onValueChange={onEffortChange} />
        </div>
      </ComboboxContent>
    </Combobox>
  );
}
