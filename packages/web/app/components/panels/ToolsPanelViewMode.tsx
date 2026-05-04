'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import type { RegistryTool, ToolGroup } from '../../lib/toolRegistry';
import { ProviderErrorRow, groupProviderId } from './ProviderErrorRow';
import { FloatingSchema, type ToolSchema } from './ToolSchemaPopover';

interface PlayButtonProps {
  tool: RegistryTool;
  onTest: (tool: RegistryTool) => void;
}

export function PlayButton({ tool, onTest }: PlayButtonProps): React.JSX.Element {
  const t = useTranslations('toolTest');
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0 opacity-0 transition-opacity group-hover/tool:opacity-100 hover:bg-[#4fc661] dark:hover:bg-[#4fc661] hover:text-background dark:hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onTest(tool);
            }}
          />
        }
      >
        <Play className="size-3" />
      </TooltipTrigger>
      <TooltipContent side="top">{t('testTool')}</TooltipContent>
    </Tooltip>
  );
}

interface ViewToolRowProps {
  tool: RegistryTool;
  expanded: boolean;
  onClick: () => void;
  onCollapse: () => void;
  onTest: (tool: RegistryTool) => void;
}

export function ViewToolRow({ tool, expanded, onClick, onCollapse, onTest }: ViewToolRowProps): React.JSX.Element {
  const rowRef = useRef<HTMLDivElement>(null);
  return (
    <li className="flex flex-col w-[calc(33.3%_-_(var(--spacing)*2))] shrink-0 bg-input/70 rounded-sm py-0">
      <div
        ref={rowRef}
        className="py-0.5 group/tool flex w-full items-start gap-1 pl-2 pr-0.5 text-left text-xs cursor-default"
        onClick={onClick}
      >
        <div className="py-0.5 flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{tool.name}</span>
          <span className="truncate text-[10px] text-muted-foreground">
            {tool.description ?? tool.group}
          </span>
        </div>
        <PlayButton tool={tool} onTest={onTest} />
      </div>
      {expanded && tool.inputSchema && (
        <FloatingSchema
          description={tool.description}
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
}

interface ToolsListGroupProps {
  group: ToolGroup;
  expandedTool: string | null;
  failedProviders: string[];
  onToggleTool: (key: string) => void;
  onCollapseTool: () => void;
  onTestTool: (tool: RegistryTool) => void;
}

function ToolsListGroup({
  group,
  expandedTool,
  failedProviders,
  onToggleTool,
  onCollapseTool,
  onTestTool,
}: ToolsListGroupProps): React.JSX.Element {
  const providerId = groupProviderId(group);
  const hasError = providerId !== null && failedProviders.includes(providerId);
  return (
    <div>
      <div className="sticky top-0 z-10 px-2 pt-0 pb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        <div className="pt-2">{group.groupName}</div>
      </div>
      {hasError && <ProviderErrorRow mode="workflow" />}
      <ul className="flex flex-row gap-2 gap-y-3 flex-wrap pl-1">
        {group.tools.map((tool) => {
          const key = `${tool.group}-${tool.name}`;
          return (
            <ViewToolRow
              key={key}
              tool={tool}
              expanded={expandedTool === key}
              onClick={() => onToggleTool(key)}
              onCollapse={onCollapseTool}
              onTest={onTestTool}
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
          />
        ))
      )}
    </div>
  );
}
