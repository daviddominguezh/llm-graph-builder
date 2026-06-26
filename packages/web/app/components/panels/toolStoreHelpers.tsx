'use client';

import type { ToolGroup } from '@/app/lib/toolRegistryTypes';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import React from 'react';

import type { SaveState } from './SaveStateIndicator';
import { StoreSelect, type StoreSelectStore } from './StoreSelect';
import type { ToolRowDisabledReason } from './ToolRow';

export interface AgentToolStoreBindingsView {
  selectedKvStoreId: string | null;
  selectedRagStoreId: string | null;
}

export interface AgentToolStoresPanelConfig {
  kvStores: StoreSelectStore[];
  ragStores: StoreSelectStore[];
  bindings: AgentToolStoreBindingsView;
  saveState: SaveState;
  onChangeBindings: (next: AgentToolStoreBindingsView) => void;
}

export type StoreKind = 'kv' | 'rag';

export function storeKindForGroup(group: ToolGroup): StoreKind | null {
  if (group.kind !== 'builtin') return null;
  if (group.providerId === 'kv_store') return 'kv';
  if (group.providerId === 'rag') return 'rag';
  return null;
}

export function renderStoreSelect(
  storeKind: StoreKind,
  stores: AgentToolStoresPanelConfig,
  placeholder: string
): React.ReactNode {
  const list = storeKind === 'kv' ? stores.kvStores : stores.ragStores;
  const selectedId =
    storeKind === 'kv' ? stores.bindings.selectedKvStoreId : stores.bindings.selectedRagStoreId;
  const handleChange = (next: string | null): void => {
    if (storeKind === 'kv') {
      stores.onChangeBindings({ ...stores.bindings, selectedKvStoreId: next });
    } else {
      stores.onChangeBindings({ ...stores.bindings, selectedRagStoreId: next });
    }
  };
  return (
    <StoreSelect
      stores={list}
      selectedId={selectedId}
      saveState={stores.saveState}
      onChange={handleChange}
      placeholder={placeholder}
    />
  );
}

/**
 * Renders the orange "select a store first" indicator when the kv/rag binding
 * is empty. Sits in the group header's leadingIndicator slot — one per group,
 * not one per tool — so the "why are these tools disabled?" affordance lives
 * where the user has to act.
 */
export function renderGroupLeadingIndicator(
  disabledTooltip: string | undefined
): React.ReactNode {
  if (disabledTooltip === undefined) return undefined;
  return <DisabledIndicator tooltip={disabledTooltip} />;
}

export function computeDisabledReason(
  storeKind: StoreKind | null,
  stores: AgentToolStoresPanelConfig | undefined
): ToolRowDisabledReason {
  if (storeKind === null || stores === undefined) return null;
  const id =
    storeKind === 'kv' ? stores.bindings.selectedKvStoreId : stores.bindings.selectedRagStoreId;
  if (id !== null) return null;
  return { kind: 'no_store_bound', storeKind };
}

interface DisabledIndicatorProps {
  tooltip: string;
}

export function DisabledIndicator({ tooltip }: DisabledIndicatorProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span aria-label={tooltip} className="inline-flex items-center">
            <Info className="size-3.5 text-orange-500 shrink-0" aria-hidden="true" />
          </span>
        }
      />
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

type TooltipTranslator = (key: 'storeRequiredTooltip', values: { kind: string }) => string;

export function buildDisabledTooltip(
  reason: ToolRowDisabledReason,
  t: TooltipTranslator
): string | undefined {
  if (reason === null || reason === undefined) return undefined;
  const label = reason.storeKind === 'kv' ? 'KV' : 'RAG';
  return t('storeRequiredTooltip', { kind: label });
}
