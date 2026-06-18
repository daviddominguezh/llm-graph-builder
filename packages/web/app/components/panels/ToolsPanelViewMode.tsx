'use client';

import { type ProviderKind, useToolCatalog } from '@/app/lib/toolCatalog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import type { RegistryTool, ToolGroup } from '../../lib/toolRegistry';
import { CatalogFreshnessIndicator } from './CatalogFreshnessIndicator';
import { ProviderErrorRow, groupProviderId } from './ProviderErrorRow';
import type { ToolRowDisabledReason } from './ToolRow';
import { FloatingSchema, type ToolSchema } from './ToolSchemaPopover';
import {
  type AgentToolStoresPanelConfig,
  buildDisabledTooltip,
  computeDisabledReason,
  renderGroupLeadingIndicator,
  renderStoreSelect,
  storeKindForGroup,
} from './toolStoreHelpers';

interface PlayButtonProps {
  tool: RegistryTool;
  onTest: (tool: RegistryTool) => void;
  disabled?: boolean;
  disabledTooltip?: string;
}

export function PlayButton({ tool, onTest, disabled, disabledTooltip }: PlayButtonProps): React.JSX.Element {
  const t = useTranslations('toolTest');
  const isDisabled = disabled === true;
  const tooltipLabel = isDisabled && disabledTooltip !== undefined ? disabledTooltip : t('testTool');
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={isDisabled}
            className="shrink-0 opacity-0 transition-opacity group-hover/tool:opacity-100 hover:bg-[#4fc661] dark:hover:bg-[#4fc661] hover:text-background dark:hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              if (isDisabled) return;
              onTest(tool);
            }}
          />
        }
      >
        <Play className="size-3" />
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}

interface ViewToolRowProps {
  tool: RegistryTool;
  providerId: string;
  providerKind: ProviderKind;
  expanded: boolean;
  onClick: () => void;
  onCollapse: () => void;
  onTest: (tool: RegistryTool) => void;
  disabledReason?: ToolRowDisabledReason;
}

interface ViewToolRowBodyProps {
  tool: RegistryTool;
  displayDescription: string | undefined;
  disabledTooltip: string | undefined;
  onTest: (tool: RegistryTool) => void;
}

function ViewToolRowBody(props: ViewToolRowBodyProps): React.JSX.Element {
  const { tool, displayDescription, disabledTooltip, onTest } = props;
  const isDisabled = disabledTooltip !== undefined;
  return (
    <>
      <div className="py-0.5 flex min-w-0 flex-1 flex-col">
        <span className="font-medium truncate">{tool.name}</span>
        <span className="truncate text-[10px] text-muted-foreground">
          {displayDescription ?? tool.group}
        </span>
      </div>
      <PlayButton tool={tool} onTest={onTest} disabled={isDisabled} disabledTooltip={disabledTooltip} />
    </>
  );
}

export function ViewToolRow({
  tool,
  providerId,
  providerKind,
  expanded,
  onClick,
  onCollapse,
  onTest,
  disabledReason,
}: ViewToolRowProps): React.JSX.Element {
  const rowRef = useRef<HTMLDivElement>(null);
  const catalog = useToolCatalog();
  const t = useTranslations('agentTools');
  const displayDescription = catalog.toolDescription(providerId, tool.name, tool.description, providerKind);
  const disabledTooltip = buildDisabledTooltip(disabledReason ?? null, t);
  const isDisabled = disabledTooltip !== undefined;
  const disabledCls = isDisabled ? 'opacity-60' : '';
  return (
    <li className={`flex flex-col w-[calc(33.3%_-_(var(--spacing)*2))] shrink-0 bg-input/70 rounded-sm py-0 ${disabledCls}`}>
      <div
        ref={rowRef}
        className="py-0.5 group/tool flex w-full items-start gap-1 pl-2 pr-0.5 text-left text-xs cursor-default"
        onClick={onClick}
      >
        <ViewToolRowBody
          tool={tool}
          displayDescription={displayDescription}
          disabledTooltip={disabledTooltip}
          onTest={onTest}
        />
      </div>
      {expanded && tool.inputSchema && (
        <FloatingSchema
          description={displayDescription}
          providerId={providerId}
          providerKind={providerKind}
          toolName={tool.name}
          anchorRef={rowRef}
          schema={tool.inputSchema as ToolSchema}
          onClose={onCollapse}
        />
      )}
    </li>
  );
}

interface ToolsListProps {
  groups: ToolGroup[];
  totalCount: number;
  expandedTool: string | null;
  failedProviders: string[];
  onToggleTool: (key: string) => void;
  onCollapseTool: () => void;
  onTestTool: (tool: RegistryTool) => void;
  stores?: AgentToolStoresPanelConfig;
}

interface ToolsListGroupProps {
  group: ToolGroup;
  expandedTool: string | null;
  failedProviders: string[];
  onToggleTool: (key: string) => void;
  onCollapseTool: () => void;
  onTestTool: (tool: RegistryTool) => void;
  stores?: AgentToolStoresPanelConfig;
}

interface GroupHeaderProps {
  displayGroupName: string;
  mcpFetchedAt: number | undefined;
  leadingIndicator: React.ReactNode | undefined;
  rightSlot: React.ReactNode | undefined;
}

function GroupHeader({
  displayGroupName,
  mcpFetchedAt,
  leadingIndicator,
  rightSlot,
}: GroupHeaderProps): React.JSX.Element {
  return (
    <div className="sticky top-0 z-10 px-2 pt-0 pb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-[rgb(255_255_255)] dark:bg-[rgb(18_18_18)]">
      <div className="pt-2 flex items-center gap-1.5">
        {leadingIndicator}
        <span>{displayGroupName}</span>
        {mcpFetchedAt !== undefined && <CatalogFreshnessIndicator fetchedAt={mcpFetchedAt} />}
        {rightSlot !== undefined && <div className="ml-auto flex items-center shrink-0">{rightSlot}</div>}
      </div>
    </div>
  );
}

interface GroupStoreState {
  rightSlot: React.ReactNode | undefined;
  leadingIndicator: React.ReactNode | undefined;
  disabledReason: ToolRowDisabledReason;
}

function useGroupStoreState(group: ToolGroup, stores: AgentToolStoresPanelConfig | undefined): GroupStoreState {
  const tr = useTranslations('agentTools');
  const storeKind = storeKindForGroup(group);
  const storePlaceholder =
    storeKind !== null ? tr('selectStoreKind', { kind: storeKind === 'kv' ? 'KV' : 'RAG' }) : '';
  const disabledReason = computeDisabledReason(storeKind, stores);
  const disabledTooltip = buildDisabledTooltip(disabledReason, tr);
  const rightSlot =
    storeKind !== null && stores !== undefined
      ? renderStoreSelect(storeKind, stores, storePlaceholder)
      : undefined;
  const leadingIndicator = renderGroupLeadingIndicator(disabledTooltip);
  return { rightSlot, leadingIndicator, disabledReason };
}

function ToolsListGroup({
  group,
  expandedTool,
  failedProviders,
  onToggleTool,
  onCollapseTool,
  onTestTool,
  stores,
}: ToolsListGroupProps): React.JSX.Element {
  const catalog = useToolCatalog();
  const providerId = groupProviderId(group);
  const hasError = providerId !== null && failedProviders.includes(providerId);
  const mcpFetchedAt = group.kind === 'mcp' ? group.fetchedAt : undefined;
  const displayGroupName = catalog.groupName(group.providerId, group.groupName, group.kind);
  const { rightSlot, leadingIndicator, disabledReason } = useGroupStoreState(group, stores);
  return (
    <div>
      <GroupHeader
        displayGroupName={displayGroupName}
        mcpFetchedAt={mcpFetchedAt}
        leadingIndicator={leadingIndicator}
        rightSlot={rightSlot}
      />
      {hasError && <ProviderErrorRow mode="workflow" />}
      <ul className="flex flex-row gap-2 gap-y-3 flex-wrap pl-1">
        {group.tools.map((tool) => {
          const key = `${tool.group}-${tool.name}`;
          return (
            <ViewToolRow
              key={key}
              tool={tool}
              providerId={group.providerId}
              providerKind={group.kind}
              expanded={expandedTool === key}
              onClick={() => onToggleTool(key)}
              onCollapse={onCollapseTool}
              onTest={onTestTool}
              disabledReason={disabledReason}
            />
          );
        })}
      </ul>
    </div>
  );
}

export function ToolsList({
  groups,
  totalCount,
  expandedTool,
  failedProviders,
  onToggleTool,
  onCollapseTool,
  onTestTool,
  stores,
}: ToolsListProps): React.JSX.Element {
  return (
    <div className="flex-1 overflow-y-auto p-1 pt-0">
      {totalCount === 0 ? (
        <p className="p-3 text-xs text-muted-foreground bg-muted rounded-md mt-2 mx-1">
          {groups.length === 0 ? 'No tools discovered yet' : 'No results'}
        </p>
      ) : (
        groups.map((group) => (
          <ToolsListGroup
            key={group.groupName}
            group={group}
            expandedTool={expandedTool}
            failedProviders={failedProviders}
            onToggleTool={onToggleTool}
            onCollapseTool={onCollapseTool}
            onTestTool={onTestTool}
            stores={stores}
          />
        ))
      )}
    </div>
  );
}
