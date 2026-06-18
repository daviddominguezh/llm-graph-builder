'use client';

import { type SelectedTool } from '@daviddh/llm-graph-runner';
import { useTranslations } from 'next-intl';
import React from 'react';

import { computeHeaderState, isToolSelected, toggleTool } from '@/app/lib/agentTools';
import type { RegistryTool, ToolGroup } from '@/app/lib/toolRegistryTypes';

import { EmptyToolsHint } from './EmptyToolsHint';
import { ProviderErrorRow, groupProviderId } from './ProviderErrorRow';
import { ProviderHeader } from './ProviderHeader';
import type { SaveState } from './SaveStateIndicator';
import { StaleEntriesGroup } from './StaleEntriesGroup';
import { StoreSelect, type StoreSelectStore } from './StoreSelect';
import { ToolRow as SelectableToolRow, type ToolRowDisabledReason } from './ToolRow';

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

export interface AgentModeProps {
  agentId: string;
  selectedTools: SelectedTool[];
  staleEntries: SelectedTool[];
  saveState: SaveState;
  onChange: (next: SelectedTool[]) => void;
  onRemoveStale: (entry: SelectedTool) => void;
  onRetrySave?: () => void;
  stores?: AgentToolStoresPanelConfig;
}

export function registryToolToSelectedTool(t: RegistryTool): SelectedTool {
  const isBuiltin = t.sourceId.startsWith('__');
  return {
    providerType: isBuiltin ? 'builtin' : 'mcp',
    providerId: isBuiltin ? t.sourceId.replace(/^__|__$/g, '') : t.sourceId,
    toolName: t.name,
  };
}

interface AgentModeBodyProps {
  agent: AgentModeProps;
  groups: ToolGroup[];
  searchActive: boolean;
  expandedTool: string | null;
  failedProviders: string[];
  onToggleTool: (key: string) => void;
  onCollapseTool: () => void;
}

export function AgentModeBody(props: AgentModeBodyProps): React.JSX.Element {
  const { agent, groups, searchActive, expandedTool, failedProviders, onToggleTool, onCollapseTool } =
    props;
  const showEmpty = agent.selectedTools.length === 0 && agent.staleEntries.length === 0;
  return (
    <div className="flex-1 overflow-y-auto p-1 pt-0">
      <StaleEntriesGroup staleEntries={agent.staleEntries} onRemove={agent.onRemoveStale} />
      {showEmpty && <EmptyToolsHint />}
      {groups.map((group) => (
        <AgentModeGroup
          key={group.groupName}
          group={group}
          agent={agent}
          searchActive={searchActive}
          expandedTool={expandedTool}
          failedProviders={failedProviders}
          onToggleTool={onToggleTool}
          onCollapseTool={onCollapseTool}
        />
      ))}
    </div>
  );
}

interface AgentModeGroupProps {
  group: ToolGroup;
  agent: AgentModeProps;
  searchActive: boolean;
  expandedTool: string | null;
  failedProviders: string[];
  onToggleTool: (key: string) => void;
  onCollapseTool: () => void;
}

function applyHeaderToggle(
  currentSelected: SelectedTool[],
  groupTools: SelectedTool[],
  headerState: 'checked' | 'unchecked' | 'indeterminate'
): SelectedTool[] {
  const allChecked = headerState === 'checked';
  let next = currentSelected;
  for (const t of groupTools) {
    const present = isToolSelected(next, t);
    if (allChecked && present) next = toggleTool(next, t);
    else if (!allChecked && !present) next = toggleTool(next, t);
  }
  return next;
}

type StoreKind = 'kv' | 'rag';

function storeKindForGroup(group: ToolGroup): StoreKind | null {
  if (group.kind !== 'builtin') return null;
  if (group.providerId === 'kv_store') return 'kv';
  if (group.providerId === 'rag') return 'rag';
  return null;
}

function renderStoreSelect(
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

function computeDisabledReason(
  storeKind: StoreKind | null,
  stores: AgentToolStoresPanelConfig | undefined
): ToolRowDisabledReason {
  if (storeKind === null || stores === undefined) return null;
  const id =
    storeKind === 'kv' ? stores.bindings.selectedKvStoreId : stores.bindings.selectedRagStoreId;
  if (id !== null) return null;
  return { kind: 'no_store_bound', storeKind };
}

interface GroupToolListProps {
  group: ToolGroup;
  agent: AgentModeProps;
  expandedTool: string | null;
  disabledReason: ToolRowDisabledReason;
  onToggleTool: (key: string) => void;
  onCollapseTool: () => void;
}

function GroupToolList(props: GroupToolListProps): React.JSX.Element {
  const { group, agent, expandedTool, disabledReason, onToggleTool, onCollapseTool } = props;
  return (
    <ul className="flex flex-row gap-2 gap-y-3 flex-wrap pl-1">
      {group.tools.map((tool) => {
        const ref = registryToolToSelectedTool(tool);
        const key = `${tool.group}-${tool.name}`;
        return (
          <SelectableToolRow
            key={key}
            tool={tool}
            selected={isToolSelected(agent.selectedTools, ref)}
            expanded={expandedTool === key}
            onToggleSelected={() => agent.onChange(toggleTool(agent.selectedTools, ref))}
            onToggleExpanded={() => onToggleTool(key)}
            onCollapse={onCollapseTool}
            disabledReason={disabledReason}
          />
        );
      })}
    </ul>
  );
}

function AgentModeGroup(props: AgentModeGroupProps): React.JSX.Element {
  const { group, agent, searchActive, expandedTool, failedProviders, onToggleTool, onCollapseTool } =
    props;
  const tr = useTranslations('agentTools');
  const groupTools = group.tools.map(registryToolToSelectedTool);
  const headerState = computeHeaderState({ groupTools, selected: agent.selectedTools });
  const selectedInGroup = groupTools.filter((t) => isToolSelected(agent.selectedTools, t)).length;
  const providerId = groupProviderId(group);
  const hasError = providerId !== null && failedProviders.includes(providerId);
  const mcpFetchedAt = group.kind === 'mcp' ? group.fetchedAt : undefined;
  const storeKind = storeKindForGroup(group);
  const storePlaceholder =
    storeKind !== null
      ? tr('selectStoreKind', { kind: storeKind === 'kv' ? 'KV' : 'RAG' })
      : '';
  const rightSlot =
    storeKind !== null && agent.stores !== undefined
      ? renderStoreSelect(storeKind, agent.stores, storePlaceholder)
      : undefined;
  const disabledReason = computeDisabledReason(storeKind, agent.stores);
  return (
    <div>
      <ProviderHeader
        groupName={group.groupName}
        state={headerState}
        selectedInGroup={selectedInGroup}
        totalInGroup={groupTools.length}
        visibleInGroup={group.tools.length}
        searchActive={searchActive}
        fetchedAt={mcpFetchedAt}
        onToggle={() => agent.onChange(applyHeaderToggle(agent.selectedTools, groupTools, headerState))}
        rightSlot={rightSlot}
      />
      {hasError && <ProviderErrorRow agentId={agent.agentId} mode="agent" />}
      <GroupToolList
        group={group}
        agent={agent}
        expandedTool={expandedTool}
        disabledReason={disabledReason}
        onToggleTool={onToggleTool}
        onCollapseTool={onCollapseTool}
      />
    </div>
  );
}
