'use client';

import { GlassPanel } from '@/components/ui/glass-panel';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { McpServerStatus } from '../../hooks/useMcpServers';
import type { ToolCallOptions } from '../../lib/api';
import { callBuiltinTool, callMcpTool } from '../../lib/api';
import type { McpLibraryRow } from '../../lib/mcpLibraryTypes';
import type { OrgEnvVariableRow } from '../../lib/orgEnvVariables';
import type { RegistryTool, ToolGroup } from '../../lib/toolRegistry';
import type { McpServerConfig, McpTransport } from '../../schemas/graph.schema';
import { useToolRegistry } from '../ToolRegistryProvider';
import { ErrorDot } from './ErrorDot';
import { McpServersSection } from './McpServersSection';
import { type RunTool, ToolTestModal } from './ToolTestModal';
import { type AgentModeProps } from './ToolsPanelAgentMode';
import { SearchRow, ToolsTabBody, useOutsideClose, useToolsPanelState } from './ToolsPanelHelpers';
import type { SectionTenant } from './mcpServersSectionLogic';
import type { AgentToolStoresPanelConfig } from './toolStoreHelpers';

interface McpProps {
  servers: McpServerConfig[];
  discovering: Record<string, boolean>;
  serverStatus: Record<string, McpServerStatus>;
  agentId: string;
  tenants: SectionTenant[];
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
  hasMcpError?: boolean;
  onClose: () => void;
  agent?: AgentModeProps;
  stores?: AgentToolStoresPanelConfig;
  agentId: string;
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

function McpTab({ mcp }: { mcp: McpProps }) {
  return (
    <div className="flex-1 overflow-y-auto p-2 pt-0 px-2">
      <McpServersSection
        servers={mcp.servers}
        discovering={mcp.discovering}
        serverStatus={mcp.serverStatus}
        agentId={mcp.agentId}
        tenants={mcp.tenants}
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

const activeTabCls = 'bg-input text-foreground shadow-none';
const inactiveTabCls =
  'text-muted-foreground hover:text-foreground border-transparent hover:bg-input dark:hover:bg-input/30';

interface PanelTabsProps {
  value: string;
  onChange: (v: string) => void;
  t: (key: string) => string;
  isAgent: boolean;
  hasMcpError: boolean;
}

function PanelTabs({ value, onChange, t, isAgent, hasMcpError }: PanelTabsProps) {
  const tabBaseCls = `relative cursor-pointer inline-flex flex-1 items-center justify-center gap-1 ${isAgent ? 'rounded-xl' : 'rounded-md'}  px-2.5 py-[calc(0.5px+var(--spacing))] text-[11px] font-medium transition-colors border border-transparent`;

  const labels: Record<string, string> = { tools: t('toolsTab'), mcp: t('mcpServersTab') };
  return (
    <div className="flex w-full gap-0.5 p-0.5">
      {PANEL_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={`${tabBaseCls} ${tab === value ? activeTabCls : inactiveTabCls}`}
        >
          <span className="relative">
            {labels[tab]}
            {tab === 'mcp' && hasMcpError && <ErrorDot className="-top-[1px] -right-[7px]" />}
          </span>
        </button>
      ))}
    </div>
  );
}

function buildCallOptions(
  server: McpServerConfig | undefined,
  orgId: string,
  agentId: string
): ToolCallOptions | undefined {
  if (server === undefined) return undefined;
  return {
    variableValues: server.variableValues as Record<string, unknown> | undefined,
    orgId,
    libraryItemId: server.libraryItemId,
    agentId,
  };
}

interface BuiltinToolMatch {
  providerId: 'kv_store' | 'rag';
}

function findBuiltinProvider(tool: RegistryTool, groups: ToolGroup[]): BuiltinToolMatch | null {
  for (const group of groups) {
    const containsTool = group.tools.some((t) => t.name === tool.name && t.sourceId === tool.sourceId);
    if (!containsTool) continue;
    if (group.kind !== 'builtin') return null;
    if (group.providerId === 'kv_store' || group.providerId === 'rag') {
      return { providerId: group.providerId };
    }
    return null;
  }
  return null;
}

function buildMcpRunner(
  transport: McpTransport | null,
  options: ToolCallOptions | undefined
): RunTool | null {
  if (transport === null) return null;
  return async (toolName, args, signal) => await callMcpTool(transport, toolName, args, options, signal);
}

function buildBuiltinRunner(providerId: 'kv_store' | 'rag', agentId: string): RunTool {
  return async (toolName, args, signal) =>
    await callBuiltinTool({ providerId, toolName, agentId, args }, signal);
}

interface UseToolTestArgs {
  servers: McpServerConfig[];
  orgId: string;
  groups: ToolGroup[];
  agentId: string;
}

function useToolTest(args: UseToolTestArgs) {
  const { servers, orgId, groups, agentId } = args;
  const [testingTool, setTestingTool] = useState<RegistryTool | null>(null);
  const runTool = useMemo<RunTool | null>(
    () => buildRunner(testingTool, { servers, orgId, groups, agentId }),
    [testingTool, servers, orgId, groups, agentId]
  );
  const openTest = useCallback((tool: RegistryTool) => setTestingTool(tool), []);
  const closeTest = useCallback(() => setTestingTool(null), []);
  return { testingTool, runTool, openTest, closeTest };
}

function buildRunner(tool: RegistryTool | null, args: UseToolTestArgs): RunTool | null {
  if (tool === null) return null;
  const builtin = findBuiltinProvider(tool, args.groups);
  if (builtin !== null) return buildBuiltinRunner(builtin.providerId, args.agentId);
  const server = args.servers.find((s) => s.id === tool.sourceId);
  const callOptions = buildCallOptions(server, args.orgId, args.agentId);
  return buildMcpRunner(server?.transport ?? null, callOptions);
}

interface ToolsTabPanelProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  panelState: ReturnType<typeof useToolsPanelState>;
  registryState: ReturnType<typeof useToolRegistry>['state'];
  filteredGroups: ToolGroup[];
  totalCount: number;
  agent?: AgentModeProps;
  stores?: AgentToolStoresPanelConfig;
  onTestTool: (tool: RegistryTool) => void;
  searchPlaceholder: string;
  isAgent?: boolean;
}

function ToolsTabPanel(props: ToolsTabPanelProps): React.JSX.Element {
  const {
    inputRef,
    panelState,
    registryState,
    filteredGroups,
    totalCount,
    agent,
    stores,
    searchPlaceholder,
  } = props;
  const onToggleTool = (key: string): void =>
    panelState.setExpandedTool((prev) => (prev === key ? null : key));
  const onCollapseTool = (): void => panelState.setExpandedTool(null);
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <SearchRow
        inputRef={inputRef}
        query={panelState.query}
        onQueryChange={panelState.setQuery}
        placeholder={searchPlaceholder}
        agent={agent}
      />
      <ToolsTabBody
        registryState={registryState}
        filteredGroups={filteredGroups}
        totalCount={totalCount}
        expandedTool={panelState.expandedTool}
        query={panelState.query}
        agent={agent}
        stores={stores}
        onToggleTool={onToggleTool}
        onCollapseTool={onCollapseTool}
        onTestTool={props.onTestTool}
      />
    </div>
  );
}

export function ToolsPanel({ mcp, open, hasMcpError, onClose, agent, stores, agentId }: ToolsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('toolbar');
  const panelState = useToolsPanelState(open);
  const { groups: allGroups, state: registryState } = useToolRegistry();
  const tt = useToolTest({ servers: mcp.servers, orgId: mcp.orgId, groups: allGroups, agentId });
  const filteredGroups = filterGroups(allGroups, panelState.query);
  const totalCount = countTools(filteredGroups);

  const isAgentEditor = agent !== undefined;

  useEffect(() => {
    if (open && panelState.activeTab === 'tools') {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, panelState.activeTab]);

  useOutsideClose(open && tt.testingTool === null, containerRef, onClose);

  if (!open) return null;

  return (
    <>
      <GlassPanel
        className={`pointer-events-auto absolute! right-0 z-20 overflow-hidden pointer-events-auto ${isAgentEditor ? 'right-[-1px] border-[0.5px] border-r-[1.5px] -mt-[0.5px] w-[400px] shadow-2xl rounded-xl top-2 h-[calc(100%-var(--spacing)*2)]!' : 'w-[calc(360px+var(--spacing)*2)] h-full top-0 border-r-[0.5px] shadow-lg rounded-s-md'}`}
      >
        <div
          ref={containerRef}
          className="flex h-full flex-col"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        >
          <div className="flex items-center border-y-0 border-x-0 border-b p-0 overflow-hidden">
            <PanelTabs
              isAgent={isAgentEditor}
              value={panelState.activeTab}
              onChange={panelState.setActiveTab}
              t={t}
              hasMcpError={hasMcpError === true}
            />
          </div>
          {panelState.activeTab === 'tools' && (
            <ToolsTabPanel
              inputRef={inputRef}
              panelState={panelState}
              registryState={registryState}
              filteredGroups={filteredGroups}
              totalCount={totalCount}
              agent={agent}
              stores={stores}
              onTestTool={tt.openTest}
              searchPlaceholder={t('searchTools')}
            />
          )}
          {panelState.activeTab === 'mcp' && (
            <div className="flex-1 overflow-y-auto px-1">
              <McpTab mcp={mcp} />
            </div>
          )}
        </div>
      </GlassPanel>
      <ToolTestModal tool={tt.testingTool} runTool={tt.runTool} onClose={tt.closeTest} />
    </>
  );
}
