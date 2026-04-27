'use client';

import { GlassPanel } from '@/components/ui/glass-panel';
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
import { ToolTestModal } from './ToolTestModal';
import { type AgentModeProps } from './ToolsPanelAgentMode';
import {
  SearchRow,
  ToolsTabBody,
  useOutsideClose,
  useToolsPanelState,
} from './ToolsPanelHelpers';

interface McpProps {
  servers: McpServerConfig[];
  discovering: Record<string, boolean>;
  serverStatus: Record<string, McpServerStatus>;
  orgId: string;
  agentId?: string;
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
  agent?: AgentModeProps;
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
        orgId={mcp.orgId}
        agentId={mcp.agentId}
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
const inactiveTabCls =
  'text-muted-foreground hover:text-foreground border-transparent hover:bg-input dark:hover:bg-card';
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

interface ToolsTabPanelProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  panelState: ReturnType<typeof useToolsPanelState>;
  registryState: ReturnType<typeof useToolRegistry>['state'];
  filteredGroups: ToolGroup[];
  totalCount: number;
  agent?: AgentModeProps;
  onTestTool: (tool: RegistryTool) => void;
  searchPlaceholder: string;
}

function ToolsTabPanel(props: ToolsTabPanelProps): React.JSX.Element {
  const { inputRef, panelState, registryState, filteredGroups, totalCount, agent, searchPlaceholder } =
    props;
  const onToggleTool = (key: string): void =>
    panelState.setExpandedTool((prev) => (prev === key ? null : key));
  const onCollapseTool = (): void => panelState.setExpandedTool(null);
  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
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
        onToggleTool={onToggleTool}
        onCollapseTool={onCollapseTool}
        onTestTool={props.onTestTool}
      />
    </div>
  );
}

export function ToolsPanel({ mcp, open, onClose, agent }: ToolsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('toolbar');
  const panelState = useToolsPanelState(open);
  const tt = useToolTest(mcp.servers, mcp.orgId);
  const { groups: allGroups, state: registryState } = useToolRegistry();
  const filteredGroups = filterGroups(allGroups, panelState.query);
  const totalCount = countTools(filteredGroups);

  useEffect(() => {
    if (open && panelState.activeTab === 'tools') {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, panelState.activeTab]);

  useOutsideClose(open, containerRef, onClose);

  if (!open) return null;

  return (
    <>
      <GlassPanel className="absolute top-12.5 left-1/2 z-20 -translate-x-1/2 w-[28rem] h-96 rounded-md shadow-lg overflow-hidden pointer-events-auto">
        <div
          ref={containerRef}
          className="flex h-full flex-col"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        >
          <div className="flex items-center border-y-0 border-x-0 border-b p-0 overflow-hidden">
            <PanelTabs value={panelState.activeTab} onChange={panelState.setActiveTab} t={t} />
          </div>
          {panelState.activeTab === 'tools' && (
            <ToolsTabPanel
              inputRef={inputRef}
              panelState={panelState}
              registryState={registryState}
              filteredGroups={filteredGroups}
              totalCount={totalCount}
              agent={agent}
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
      <ToolTestModal
        tool={tt.testingTool}
        transport={tt.transport}
        callOptions={tt.callOptions}
        onClose={tt.closeTest}
      />
    </>
  );
}
