'use client';

import { type SelectedTool } from '@daviddh/llm-graph-runner';
import React from 'react';

import { computeHeaderState, isToolSelected, toggleTool } from '@/app/lib/agentTools';
import type { RegistryTool, ToolGroup } from '@/app/lib/toolRegistryTypes';

import { EmptyToolsHint } from './EmptyToolsHint';
import { ProviderErrorRow, groupProviderId } from './ProviderErrorRow';
import { ProviderHeader } from './ProviderHeader';
import type { SaveState } from './SaveStateIndicator';
import { StaleEntriesGroup } from './StaleEntriesGroup';
import { ToolRow as SelectableToolRow } from './ToolRow';

export interface AgentModeProps {
  agentId: string;
  selectedTools: SelectedTool[];
  staleEntries: SelectedTool[];
  saveState: SaveState;
  onChange: (next: SelectedTool[]) => void;
  onRemoveStale: (entry: SelectedTool) => void;
  onRetrySave?: () => void;
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

function AgentModeGroup(props: AgentModeGroupProps): React.JSX.Element {
  const { group, agent, searchActive, expandedTool, failedProviders, onToggleTool, onCollapseTool } =
    props;
  const groupTools = group.tools.map(registryToolToSelectedTool);
  const headerState = computeHeaderState({ groupTools, selected: agent.selectedTools });
  const selectedInGroup = groupTools.filter((t) => isToolSelected(agent.selectedTools, t)).length;
  const providerId = groupProviderId(group);
  const hasError = providerId !== null && failedProviders.includes(providerId);
  return (
    <div>
      <ProviderHeader
        groupName={group.groupName}
        state={headerState}
        selectedInGroup={selectedInGroup}
        totalInGroup={groupTools.length}
        visibleInGroup={group.tools.length}
        searchActive={searchActive}
        onToggle={() => agent.onChange(applyHeaderToggle(agent.selectedTools, groupTools, headerState))}
      />
      {hasError && <ProviderErrorRow agentId={agent.agentId} mode="agent" />}
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
            />
          );
        })}
      </ul>
    </div>
  );
}
