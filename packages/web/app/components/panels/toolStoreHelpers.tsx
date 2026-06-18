'use client';

import type { ToolGroup } from '@/app/lib/toolRegistryTypes';
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
 * Renders the kv/rag group header's right slot. When the store is unbound, the
 * orange info icon + tooltip sit beside the dropdown so the "why are these
 * tools disabled?" affordance lives at the group level (not on each tool row).
 */
export function renderGroupRightSlot(
  storeKind: StoreKind,
  stores: AgentToolStoresPanelConfig,
  placeholder: string,
  disabledTooltip: string | undefined
): React.ReactNode {
  return (
    <span className="inline-flex items-center gap-1.5">
      {disabledTooltip !== undefined && <DisabledIndicator tooltip={disabledTooltip} />}
      {renderStoreSelect(storeKind, stores, placeholder)}
    </span>
  );
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
    <span title={tooltip} aria-label={tooltip} className="inline-flex items-center">
      <Info className="size-3.5 text-orange-500 shrink-0" aria-hidden="true" />
    </span>
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
