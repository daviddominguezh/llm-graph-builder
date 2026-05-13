'use client';

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxPopupInput,
  ComboboxTrigger,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useMemo } from 'react';

import type { OpenRouterModel } from '../../../hooks/useOpenRouterModels';
import { SimulationThinkingEffort, type ThinkingEffort } from './SimulationThinkingEffort';

interface ProviderIcon {
  url: string;
  className?: string;
}

interface ProviderGroup {
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

function buildGroups(models: OpenRouterModel[]): ProviderGroup[] {
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

interface TriggerLabelProps {
  label: string;
  effort: ThinkingEffort;
}

function TriggerLabel({ label, effort }: TriggerLabelProps) {
  return (
    <>
      <span className="truncate">{label}</span>
      {effort === 'high' && (
        <span className="shrink-0 text-[11px] text-muted-foreground/60">Thinking</span>
      )}
    </>
  );
}

interface ProviderGroupSectionProps {
  group: ProviderGroup;
  icon: ProviderIcon | undefined;
  nameMap: Map<string, string>;
}

function ProviderGroupSection({ group, icon, nameMap }: ProviderGroupSectionProps) {
  return (
    <ComboboxGroup items={group.items}>
      <ComboboxLabel className="my-1 sticky -top-1 z-10 flex items-center gap-1.5 bg-card font-semibold uppercase text-muted-foreground/60">
        {icon !== undefined && <ProviderImg icon={icon} size={12} />}
        {group.value}
      </ComboboxLabel>
      <ComboboxCollection>
        {(modelId: string) => (
          <ComboboxItem className="cursor-pointer mx-1 w-[calc(100%-var(--spacing)*2)]" key={modelId} value={modelId}>
            {nameMap.get(modelId) ?? modelId}
          </ComboboxItem>
        )}
      </ComboboxCollection>
    </ComboboxGroup>
  );
}

interface SimulationModelSelectorProps {
  models: OpenRouterModel[];
  value: string;
  onValueChange: (value: string) => void;
  effort: ThinkingEffort;
  onEffortChange: (value: ThinkingEffort) => void;
}

export function SimulationModelSelector({
  models,
  value,
  onValueChange,
  effort,
  onEffortChange,
}: SimulationModelSelectorProps) {
  const t = useTranslations('simulation');
  const groups = useMemo(() => buildGroups(models), [models]);
  const iconMap = useMemo(() => buildIconMap(models), [models]);
  const nameMap = useMemo(
    () => new Map(models.map((m) => [m.id, m.name.replace(/^[^:]+:\s*/, '')])),
    [models]
  );
  const anchorRef = useComboboxAnchor();

  const selectedLabel = nameMap.get(value) ?? t('selectModel');

  return (
    <Combobox
      items={groups}
      value={value}
      onValueChange={(v) => onValueChange(v ?? '')}
      itemToStringLabel={extractShortName}
    >
      <div ref={anchorRef}>
        <ComboboxTrigger className="flex h-6 items-center gap-1 rounded-md bg-transparent px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-background data-popup-open:bg-background">
          <TriggerLabel label={selectedLabel} effort={effort} />
        </ComboboxTrigger>
      </div>
      <ComboboxContent className="flex h-72 w-[280px] flex-col" align="end" anchor={anchorRef}>
        <div className="flex h-8 shrink-0 items-center gap-1.5 border-b px-2">
          <Search className="size-3 shrink-0 text-muted-foreground/70" />
          <ComboboxPopupInput placeholder={t('searchModels')} />
        </div>
        <ComboboxEmpty>{t('noModelsFound')}</ComboboxEmpty>
        <ComboboxList className="flex-1 py-1 px-0">
          {(group: ProviderGroup) => (
            <ProviderGroupSection
              key={group.value}
              group={group}
              icon={iconMap.get(group.value)}
              nameMap={nameMap}
            />
          )}
        </ComboboxList>
        <div className="shrink-0 border-t px-2 py-1.5">
          <SimulationThinkingEffort value={effort} onValueChange={onEffortChange} />
        </div>
      </ComboboxContent>
    </Combobox>
  );
}
