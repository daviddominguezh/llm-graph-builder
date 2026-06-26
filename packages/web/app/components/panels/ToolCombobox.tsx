'use client';

import { Button } from '@/components/ui/button';
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
import type { SelectedTool } from '@daviddh/llm-graph-runner';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { RegistryTool } from '../../lib/toolRegistryTypes';
import { useToolRegistry } from '../ToolRegistryProvider';
import { FixStorePopover } from './FixStorePopover';
import type { StoreSelectStore } from './StoreSelect';

export interface ToolComboboxBindings {
  selectedKvStoreId: string | null;
  selectedRagStoreId: string | null;
}

interface ToolComboboxProps {
  /** Selected tool ref or null for unselected. */
  value: SelectedTool | null;
  onValueChange: (value: SelectedTool | null) => void;
  placeholder?: string;
  bindings?: ToolComboboxBindings;
  kvStores?: StoreSelectStore[];
  ragStores?: StoreSelectStore[];
  onChangeBindings?: (next: ToolComboboxBindings) => void;
}

interface ToolGroupItem {
  value: string;
  items: string[];
}

type DisabledByBinding = 'kv' | 'rag' | null;

/**
 * Derives providerType and providerId from a RegistryTool's sourceId.
 * Built-in tools have sourceId in the form `__<providerId>__`.
 * MCP tools use the raw uuid as sourceId.
 */
function deriveProvider(sourceId: string): { providerType: 'builtin' | 'mcp'; providerId: string } {
  const builtinMatch = /^__(.+)__$/.exec(sourceId);
  if (builtinMatch) {
    return { providerType: 'builtin', providerId: builtinMatch[1] ?? '' };
  }
  return { providerType: 'mcp', providerId: sourceId };
}

function toItemValue(ref: SelectedTool): string {
  return `${ref.providerType}:${ref.providerId}:${ref.toolName}`;
}

function fromItemValue(itemValue: string): SelectedTool | null {
  const colonIdx = itemValue.indexOf(':');
  if (colonIdx === -1) return null;
  const providerType = itemValue.slice(0, colonIdx);
  if (providerType !== 'builtin' && providerType !== 'mcp') return null;
  const rest = itemValue.slice(colonIdx + 1);
  const secondColon = rest.indexOf(':');
  if (secondColon === -1) return null;
  return {
    providerType,
    providerId: rest.slice(0, secondColon),
    toolName: rest.slice(secondColon + 1),
  };
}

function buildGroupItems(tools: ReadonlyArray<RegistryTool>): ToolGroupItem[] {
  const groupMap = new Map<string, string[]>();
  for (const tool of tools) {
    const { providerType, providerId } = deriveProvider(tool.sourceId);
    const itemValue = toItemValue({ providerType, providerId, toolName: tool.name });
    const existing = groupMap.get(tool.group);
    if (existing) {
      existing.push(itemValue);
    } else {
      groupMap.set(tool.group, [itemValue]);
    }
  }
  return Array.from(groupMap.entries()).map(([groupName, items]) => ({
    value: groupName,
    items,
  }));
}

function computeDisabledByBinding(
  ref: SelectedTool | null,
  bindings: ToolComboboxBindings | undefined
): DisabledByBinding {
  if (ref === null || bindings === undefined) return null;
  if (ref.providerType !== 'builtin') return null;
  if (ref.providerId === 'kv_store' && bindings.selectedKvStoreId === null) return 'kv';
  if (ref.providerId === 'rag' && bindings.selectedRagStoreId === null) return 'rag';
  return null;
}

interface ItemBindingProps {
  storeKind: 'kv' | 'rag';
  bindings: ToolComboboxBindings;
  kvStores: StoreSelectStore[];
  ragStores: StoreSelectStore[];
  onChangeBindings: (next: ToolComboboxBindings) => void;
}

function buildFixConfirm(
  storeKind: 'kv' | 'rag',
  bindings: ToolComboboxBindings,
  onChangeBindings: (next: ToolComboboxBindings) => void
): (next: string | null) => void {
  return (next) => {
    if (storeKind === 'kv') {
      onChangeBindings({ ...bindings, selectedKvStoreId: next });
    } else {
      onChangeBindings({ ...bindings, selectedRagStoreId: next });
    }
  };
}

function FixLinkButton({ binding }: { binding: ItemBindingProps }) {
  const t = useTranslations('agentTools');
  const { storeKind, bindings, kvStores, ragStores, onChangeBindings } = binding;
  const stores = storeKind === 'kv' ? kvStores : ragStores;
  const currentSelectedId =
    storeKind === 'kv' ? bindings.selectedKvStoreId : bindings.selectedRagStoreId;
  const fixLabel = t('fix');
  const stopPropagation = (e: React.MouseEvent): void => {
    e.stopPropagation();
  };
  return (
    <FixStorePopover
      trigger={
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs ml-auto"
          onClick={stopPropagation}
        >
          {fixLabel}
        </Button>
      }
      storeKind={storeKind}
      stores={stores}
      currentSelectedId={currentSelectedId}
      onConfirm={buildFixConfirm(storeKind, bindings, onChangeBindings)}
    />
  );
}

interface ToolItemProps {
  item: string;
  bindings: ToolComboboxBindings | undefined;
  kvStores: StoreSelectStore[];
  ragStores: StoreSelectStore[];
  onChangeBindings: ((next: ToolComboboxBindings) => void) | undefined;
}

function ToolItem({ item, bindings, kvStores, ragStores, onChangeBindings }: ToolItemProps) {
  const ref = fromItemValue(item);
  const label = ref?.toolName ?? item;
  const disabledByBinding = computeDisabledByBinding(ref, bindings);
  if (disabledByBinding !== null && bindings !== undefined && onChangeBindings !== undefined) {
    return (
      <ComboboxItem key={item} value={item} disabled className="opacity-60 flex items-center gap-2">
        <span>{label}</span>
        <FixLinkButton
          binding={{
            storeKind: disabledByBinding,
            bindings,
            kvStores,
            ragStores,
            onChangeBindings,
          }}
        />
      </ComboboxItem>
    );
  }
  return (
    <ComboboxItem key={item} value={item}>
      {label}
    </ComboboxItem>
  );
}

export function ToolCombobox({
  value,
  onValueChange,
  placeholder,
  bindings,
  kvStores,
  ragStores,
  onChangeBindings,
}: ToolComboboxProps) {
  const { tools } = useToolRegistry();
  const groupItems = useMemo(() => buildGroupItems(tools), [tools]);
  const itemValue = value !== null ? toItemValue(value) : '';
  const resolvedKv = kvStores ?? [];
  const resolvedRag = ragStores ?? [];

  const handleValueChange = (v: string | null) => {
    if (!v) {
      onValueChange(null);
      return;
    }
    onValueChange(fromItemValue(v));
  };

  return (
    <Combobox items={groupItems} value={itemValue} onValueChange={handleValueChange}>
      <ComboboxInput placeholder={placeholder ?? 'Select tool...'} className="h-8 text-xs" />
      <ComboboxContent>
        <ComboboxEmpty>No tools found</ComboboxEmpty>
        <ComboboxList>
          {(group) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(item) => (
                  <ToolItem
                    key={item}
                    item={item}
                    bindings={bindings}
                    kvStores={resolvedKv}
                    ragStores={resolvedRag}
                    onChangeBindings={onChangeBindings}
                  />
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
