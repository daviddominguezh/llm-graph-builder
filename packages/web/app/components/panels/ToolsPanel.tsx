'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Play, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { McpServerStatus } from '../../hooks/useMcpServers';
import type { ToolCallOptions } from '../../lib/api';
import type { McpLibraryRow } from '../../lib/mcpLibraryTypes';
import type { OrgEnvVariableRow } from '../../lib/orgEnvVariables';
import type { RegistryTool, ToolGroup } from '../../lib/toolRegistry';
import type { McpServerConfig } from '../../schemas/graph.schema';
import { useToolRegistry } from '../ToolRegistryProvider';
import { McpServersSection } from './McpServersSection';
import { FloatingSchema, type ToolSchema } from './ToolSchemaPopover';
import { ToolTestModal } from './ToolTestModal';

interface McpProps {
  servers: McpServerConfig[];
  discovering: Record<string, boolean>;
  serverStatus: Record<string, McpServerStatus>;
  orgId: string;
  envVariables: OrgEnvVariableRow[];
  libraryItems?: McpLibraryRow[];
  onAddServer: () => void;
  onRemoveServer: (id: string) => void;
  onUpdateServer: (id: string, updates: Partial<McpServerConfig>) => void;
  onDiscoverTools: (id: string) => void;
  onPublishServer: (server: McpServerConfig) => void;
  onOpenLibrary: () => void;
}

interface ToolsPanelProps {
  mcp: McpProps;
  open: boolean;
  onClose: () => void;
}

function filterGroups(groups: ToolGroup[], query: string): ToolGroup[] {
  if (query === '') return groups;
  const lower = query.toLowerCase();
  return groups
    .map((g) => ({
      ...g,
      tools: g.tools.filter(
        (t) => t.name.toLowerCase().includes(lower) || t.description?.toLowerCase().includes(lower)
      ),
    }))
    .filter((g) => g.tools.length > 0);
}

function countTools(groups: ToolGroup[]): number {
  let count = 0;
  for (const g of groups) count += g.tools.length;
  return count;
}

function PlayButton({ tool, onTest }: { tool: RegistryTool; onTest: (tool: RegistryTool) => void }) {
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

function ToolRow({
  tool,
  expanded,
  onClick,
  onCollapse,
  onTest,
}: {
  tool: RegistryTool;
  expanded: boolean;
  onClick: () => void;
  onCollapse: () => void;
  onTest: (tool: RegistryTool) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  return (
    <li className="flex flex-col w-[calc(50%_-_(var(--spacing)*2))] shrink-0 bg-card rounded-sm py-1.5">
      <div
        ref={rowRef}
        className="group/tool flex w-full items-start gap-1 px-1 py-0 text-left text-xs cursor-pointer border-l-2 border-ring hover:border-accent"
        onClick={onClick}
      >
        <div className="flex min-w-0 flex-1 flex-col">
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

function ToolsList({
  groups,
  totalCount,
  expandedTool,
  onToggleTool,
  onCollapseTool,
  onTestTool,
}: {
  groups: ToolGroup[];
  totalCount: number;
  expandedTool: string | null;
  onToggleTool: (key: string) => void;
  onCollapseTool: () => void;
  onTestTool: (tool: RegistryTool) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-1 pt-0">
      {totalCount === 0 ? (
        <p className="p-3 text-xs text-muted-foreground bg-muted rounded-md mt-2 mx-1">
          {groups.length === 0 ? 'No tools discovered yet' : 'No results'}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.groupName}>
            <div className="sticky top-0 z-10 bg-background px-2 pt-0 pb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              <div className="pt-2">{group.groupName}</div>
            </div>
            <ul className="flex flex-row gap-2 gap-y-3 flex-wrap pl-1">
              {group.tools.map((tool) => {
                const key = `${tool.group}-${tool.name}`;
                return (
                  <ToolRow
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
        ))
      )}
    </div>
  );
}

function McpTab({ mcp }: { mcp: McpProps }) {
  return (
    <div className="flex-1 overflow-y-auto p-2 pt-0 px-2">
      <McpServersSection
        servers={mcp.servers}
        discovering={mcp.discovering}
        serverStatus={mcp.serverStatus}
        orgId={mcp.orgId}
        envVariables={mcp.envVariables}
        libraryItems={mcp.libraryItems}
        onAdd={mcp.onAddServer}
        onRemove={mcp.onRemoveServer}
        onUpdate={mcp.onUpdateServer}
        onDiscover={mcp.onDiscoverTools}
        onPublish={mcp.onPublishServer}
        onOpenLibrary={mcp.onOpenLibrary}
      />
    </div>
  );
}

const PANEL_TABS = ['tools', 'mcp'] as const;
const activeTabCls = 'bg-background dark:bg-input text-foreground shadow-sm';
const inactiveTabCls = 'text-muted-foreground hover:text-foreground border-transparent hover:bg-input dark:hover:bg-card';
const tabBaseCls =
  'cursor-pointer inline-flex flex-1 items-center justify-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors border border-transparent';

function PanelTabs({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  t: (key: string) => string;
}) {
  const labels: Record<string, string> = { tools: t('toolsTab'), mcp: t('mcpServersTab') };
  return (
    <div className="flex w-full gap-0.5 bg-card dark:bg-background p-0.5">
      {PANEL_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={`${tabBaseCls} ${tab === value ? activeTabCls : inactiveTabCls}`}
        >
          {labels[tab]}
        </button>
      ))}
    </div>
  );
}

function buildCallOptions(server: McpServerConfig | undefined, orgId: string): ToolCallOptions | undefined {
  if (server === undefined) return undefined;
  return {
    variableValues: server.variableValues as Record<string, unknown> | undefined,
    orgId,
    libraryItemId: server.libraryItemId,
  };
}

function useToolTest(servers: McpServerConfig[], orgId: string) {
  const [testingTool, setTestingTool] = useState<RegistryTool | null>(null);
  const server = testingTool !== null ? servers.find((s) => s.id === testingTool.sourceId) : undefined;
  const transport = server?.transport ?? null;
  const callOptions = buildCallOptions(server, orgId);
  const openTest = useCallback((tool: RegistryTool) => setTestingTool(tool), []);
  const closeTest = useCallback(() => setTestingTool(null), []);
  return { testingTool, transport, callOptions, openTest, closeTest };
}

export function ToolsPanel({ mcp, open, onClose }: ToolsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('toolbar');
  const [query, setQuery] = useState('');
  const [prevOpen, setPrevOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('tools');
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const tt = useToolTest(mcp.servers, mcp.orgId);

  if (open && !prevOpen) {
    setPrevOpen(true);
    setQuery('');
    setActiveTab('tools');
    setExpandedTool(null);
  }
  if (!open && prevOpen) setPrevOpen(false);

  const { groups: allGroups } = useToolRegistry();
  const filteredGroups = filterGroups(allGroups, query);
  const totalCount = countTools(filteredGroups);

  useEffect(() => {
    if (open && activeTab === 'tools') requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, activeTab]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (containerRef.current?.contains(el) !== true && el.closest('[data-tools-panel-portal]') === null)
        onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        ref={containerRef}
        className="absolute top-12.5 left-1/2 z-20 -translate-x-1/2 w-[28rem] h-96 flex flex-col rounded-md border bg-background shadow-lg overflow-hidden"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="flex items-center border-y-0 border-x-0 border-b p-0 overflow-hidden">
          <PanelTabs value={activeTab} onChange={setActiveTab} t={t} />
        </div>
        {activeTab === 'tools' && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b">
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchTools')}
                className="h-7 border-0 bg-transparent! p-0 text-xs shadow-none focus-visible:ring-0"
              />
            </div>
            <ToolsList
              groups={filteredGroups}
              totalCount={totalCount}
              expandedTool={expandedTool}
              onToggleTool={(key) => setExpandedTool((prev) => (prev === key ? null : key))}
              onCollapseTool={() => setExpandedTool(null)}
              onTestTool={tt.openTest}
            />
          </div>
        )}
        {activeTab === 'mcp' && (
          <div className="flex-1 overflow-y-auto px-1">
            <McpTab mcp={mcp} />
          </div>
        )}
      </div>
      <ToolTestModal
        tool={tt.testingTool}
        transport={tt.transport}
        callOptions={tt.callOptions}
        onClose={tt.closeTest}
      />
    </>
  );
}
