'use client';

import { computeHeaderState, isToolSelected, toggleTool } from '@/app/lib/agentTools';
import type { RegistryTool, ToolGroup } from '@/app/lib/toolRegistryTypes';
import { type SelectedTool } from '@daviddh/llm-graph-runner';
import { useTranslations } from 'next-intl';
import React from 'react';

import { Scrollable } from '../Scrollable';
import { ProviderErrorRow, groupProviderId } from './ProviderErrorRow';
import { ProviderHeader } from './ProviderHeader';
import type { SaveState } from './SaveStateIndicator';
import { StaleEntriesGroup } from './StaleEntriesGroup';
import { ToolRow as SelectableToolRow, type ToolRowDisabledReason } from './ToolRow';
import {
  type AgentToolStoresPanelConfig,
  buildDisabledTooltip,
  computeDisabledReason,
  renderGroupLeadingIndicator,
  renderStoreSelect,
  storeKindForGroup,
} from './toolStoreHelpers';

export type { AgentToolStoreBindingsView, AgentToolStoresPanelConfig } from './toolStoreHelpers';

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
  onTestTool: (tool: RegistryTool) => void;
}

export function AgentModeBody(props: AgentModeBodyProps): React.JSX.Element {
  const {
    agent,
    groups,
    searchActive,
    expandedTool,
    failedProviders,
    onToggleTool,
    onCollapseTool,
    onTestTool,
  } = props;

  return (
    <Scrollable className="flex-1 p-1 pt-0">
      <StaleEntriesGroup staleEntries={agent.staleEntries} onRemove={agent.onRemoveStale} />

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
          onTestTool={onTestTool}
        />
      ))}
    </Scrollable>
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
  onTestTool: (tool: RegistryTool) => void;
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

interface GroupToolListProps {
  group: ToolGroup;
  agent: AgentModeProps;
  expandedTool: string | null;
  disabledReason: ToolRowDisabledReason;
  onToggleTool: (key: string) => void;
  onCollapseTool: () => void;
  onTestTool: (tool: RegistryTool) => void;
}

function GroupToolList(props: GroupToolListProps): React.JSX.Element {
  const { group, agent, expandedTool, disabledReason, onToggleTool, onCollapseTool, onTestTool } = props;
  return (
    <ul className="flex flex-row gap-2 gap-y-3 flex-wrap pl-1">
      {group.tools.map((tool) => {
        const ref = registryToolToSelectedTool(tool);
        const key = `${tool.group}-${tool.name}`;
        return (
          <SelectableToolRow
            key={key}
            tool={tool}
            providerId={group.providerId}
            providerKind={group.kind}
            selected={isToolSelected(agent.selectedTools, ref)}
            expanded={expandedTool === key}
            onToggleSelected={() => agent.onChange(toggleTool(agent.selectedTools, ref))}
            onToggleExpanded={() => onToggleTool(key)}
            onCollapse={onCollapseTool}
            onTest={onTestTool}
            disabledReason={disabledReason}
          />
        );
      })}
    </ul>
  );
}

function AgentModeGroup(props: AgentModeGroupProps): React.JSX.Element {
  const {
    group,
    agent,
    searchActive,
    expandedTool,
    failedProviders,
    onToggleTool,
    onCollapseTool,
    onTestTool,
  } = props;
  const tr = useTranslations('agentTools');
  const groupTools = group.tools.map(registryToolToSelectedTool);
  const headerState = computeHeaderState({ groupTools, selected: agent.selectedTools });
  const selectedInGroup = groupTools.filter((t) => isToolSelected(agent.selectedTools, t)).length;
  const providerId = groupProviderId(group);
  const hasError = providerId !== null && failedProviders.includes(providerId);
  const mcpFetchedAt = group.kind === 'mcp' ? group.fetchedAt : undefined;
  const storeKind = storeKindForGroup(group);
  const storePlaceholder =
    storeKind !== null ? tr('selectStoreKind', { kind: storeKind === 'kv' ? 'KV' : 'RAG' }) : '';
  const disabledReason = computeDisabledReason(storeKind, agent.stores);
  const disabledTooltip = buildDisabledTooltip(disabledReason, tr);
  const rightSlot =
    storeKind !== null && agent.stores !== undefined
      ? renderStoreSelect(storeKind, agent.stores, storePlaceholder)
      : undefined;
  const leadingIndicator = renderGroupLeadingIndicator(disabledTooltip);
  return (
    <div>
      <ProviderHeader
        providerId={group.providerId}
        providerKind={group.kind}
        groupName={group.groupName}
        state={headerState}
        selectedInGroup={selectedInGroup}
        totalInGroup={groupTools.length}
        visibleInGroup={group.tools.length}
        searchActive={searchActive}
        fetchedAt={mcpFetchedAt}
        onToggle={() => agent.onChange(applyHeaderToggle(agent.selectedTools, groupTools, headerState))}
        leadingIndicator={leadingIndicator}
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
        onTestTool={onTestTool}
      />
    </div>
  );
}
