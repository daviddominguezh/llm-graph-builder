'use client';

import type { SelectedTool } from '@daviddh/llm-graph-runner';
import type { Edge } from '@xyflow/react';

import type { ApiKeyRow } from '../lib/apiKeys';
import type { OrgEnvVariableRow } from '../lib/orgEnvVariables';
import type { Agent, McpServerConfig } from '../schemas/graph.schema';
import type { McpServersState } from '../hooks/useMcpServers';
import type { OutputSchemasState } from '../hooks/useOutputSchemas';
import type { PushOperation } from '../utils/operationBuilders';
import type { RFEdgeData } from '../utils/graphTransformers';
import type { UseGraphSelectionReturn } from '../hooks/useGraphSelection';
import type { McpLibraryState } from '../hooks/useMcpLibrary';
import type { ContextPreset } from '../types/preset';
import { findStaleSelections } from '../lib/agentTools';
import { useAgentToolsState } from '../hooks/useAgentToolsState';
import { useToolRegistry } from './ToolRegistryProvider';
import { registryToolToSelectedTool } from './panels/ToolsPanelAgentMode';

import { GlassPanel } from '@/components/ui/glass-panel';
import { START_NODE_ID } from '../utils/graphInitializer';
import { EdgePanel } from './panels/EdgePanel';
import { GlobalNodesPanel } from './panels/GlobalNodesPanel';
import { NodePanel } from './panels/NodePanel';
import { OutputSchemaDialog } from './panels/OutputSchemaDialog';
import { StartNodePanel } from './panels/StartNodePanel';
import { ToolsPanel } from './panels/ToolsPanel';
import { McpDialogs } from './SidePanelAsides';
import type { CtxPreconditionsState, EdgeSetter, NodeArray, NodeSetter } from './sidePanelHelpers';
import {
  handleGlobalAddNode,
  handleGlobalDeleteNode,
  handleGlobalSetFallback,
  handleGlobalUpdateNode,
} from './sidePanelHelpers';
import { getInstalledLibraryIds } from './sidePanelMcpHelpers';
import type { SchemaDialogState } from './useSidePanelState';
import { usePublishState } from './useSidePanelState';

type EdgeArray = Array<Edge<RFEdgeData>>;

interface PresetsHook {
  presets: ContextPreset[];
  activePresetId: string;
  contextKeys: string[];
  setActivePresetId: (id: string) => void;
  addPreset: () => void;
  deletePreset: (id: string) => void;
  updatePreset: (id: string, updates: Partial<ContextPreset>) => void;
  addContextKey: (key: string) => void;
  removeContextKey: (key: string) => void;
  renameContextKey: (old: string, newKey: string) => void;
}

export { type CtxPreconditionsState };

export interface SidePanelsProps {
  readOnly?: boolean;
  selection: UseGraphSelectionReturn;
  simulation: { active: boolean };
  nodes: NodeArray;
  edges: EdgeArray;
  agents: Agent[];
  presetsHook: PresetsHook;
  mcpHook: McpServersState;
  outputSchemasHook: OutputSchemasState;
  schemaDialog: SchemaDialogState;
  globalPanelOpen: boolean;
  toolsOpen: boolean;
  libraryOpen: boolean;
  mcpLibrary: McpLibraryState;
  setNodes: NodeSetter;
  setEdges: EdgeSetter;
  ctxPreconditions: CtxPreconditionsState;
  orgApiKeys: ApiKeyRow[];
  orgId: string;
  agentId: string;
  agentName: string;
  orgSlug: string;
  envVariables: OrgEnvVariableRow[];
  stagingKeyId: string | null;
  productionKeyId: string | null;
  onStagingKeyChange: (keyId: string | null) => void;
  onProductionKeyChange: (keyId: string | null) => void;
  onPublishMcpServer: (server: McpServerConfig) => void;
  onOpenMcpLibrary: () => void;
  onCloseLibrary: () => void;
  pushOperation: PushOperation;
  agentToolsConfig?: AgentToolsConfig;
}

export interface AgentToolsConfig {
  agentId: string;
  appType: string;
  initialSelectedTools: SelectedTool[];
  initialUpdatedAt: string;
}

interface SelectionPanelProps extends SidePanelsProps {
  onEditSchema: (id: string) => void;
  onEditNewSchema: (id: string) => void;
}

function SelectionPanel(props: SelectionPanelProps) {
  const { selection, nodes, agents, presetsHook, ctxPreconditions, pushOperation } = props;
  const isStartNode = selection.selectedNodeId === START_NODE_ID;

  return (
    <GlassPanel className="absolute! h-[calc(100%-var(--spacing)*4)] right-2 top-2 bottom-2 z-10 w-80! rounded-md pointer-events-auto">
      {selection.selectedNodeId !== null && isStartNode && (
        <StartNodePanel
          nodeId={selection.selectedNodeId}
          allNodes={nodes}
          agents={agents}
          presets={presetsHook.presets}
          activePresetId={presetsHook.activePresetId}
          onSetActivePreset={presetsHook.setActivePresetId}
          outputSchemas={props.outputSchemasHook.schemas}
        />
      )}
      {selection.selectedNodeId !== null && !isStartNode && (
        <NodePanel
          nodeId={selection.selectedNodeId}
          allNodes={nodes}
          agents={agents}
          presets={presetsHook.presets}
          activePresetId={presetsHook.activePresetId}
          globalNodeIds={nodes.filter((n) => n.data.global === true).map((n) => n.id)}
          onSetActivePreset={presetsHook.setActivePresetId}
          onNodeDeleted={() => selection.setSelectedNodeId(null)}
          onNodeIdChanged={(newId) => selection.setSelectedNodeId(newId)}
          onSelectEdge={selection.selectEdge}
          onSelectNode={selection.navigateToNode}
          pushOperation={pushOperation}
          outputSchemas={props.outputSchemasHook.schemas}
          onAddOutputSchema={props.outputSchemasHook.addSchema}
          onEditOutputSchema={props.onEditSchema}
          onEditNewOutputSchema={props.onEditNewSchema}
        />
      )}
      {selection.selectedEdgeId !== null && (
        <EdgePanel
          edgeId={selection.selectedEdgeId}
          onEdgeDeleted={() => selection.setSelectedEdgeId(null)}
          availableContextPreconditions={ctxPreconditions.allContextPreconditions}
          onSelectNode={selection.navigateToNode}
          pushOperation={pushOperation}
        />
      )}
    </GlassPanel>
  );
}

type GlobalPanelProps = Pick<SidePanelsProps, 'setNodes' | 'setEdges' | 'nodes' | 'pushOperation'>;

function GlobalPanel({ setNodes, setEdges, nodes, pushOperation }: GlobalPanelProps) {
  return (
    <GlassPanel className="absolute right-1.5 top-1.5 bottom-0 z-10 w-80 rounded-md pointer-events-auto">
      <GlobalNodesPanel
        nodes={nodes}
        onAddNode={() => handleGlobalAddNode(setNodes, pushOperation)}
        onDeleteNode={(nodeId) => handleGlobalDeleteNode(nodeId, setNodes, setEdges, pushOperation)}
        onUpdateNode={(nodeId, updates) => {
          handleGlobalUpdateNode(nodeId, updates, nodes, setNodes, pushOperation);
        }}
        onSetDefaultFallback={(nodeId) => {
          handleGlobalSetFallback(nodeId, nodes, setNodes, pushOperation);
        }}
      />
    </GlassPanel>
  );
}

interface ToolsPanelSlotProps {
  sidePanelProps: SidePanelsProps;
  onPublishServer: (server: McpServerConfig) => void;
}

function buildMcpProps(p: SidePanelsProps, onPublishServer: (server: McpServerConfig) => void) {
  return {
    servers: p.mcpHook.servers,
    discovering: p.mcpHook.discovering,
    serverStatus: p.mcpHook.serverStatus,
    orgId: p.orgId,
    agentId: p.agentId,
    envVariables: p.envVariables,
    libraryItems: p.mcpLibrary.items,
    onAddServer: p.mcpHook.addServer,
    onRemoveServer: p.mcpHook.removeServer,
    onUpdateServer: p.mcpHook.updateServer,
    onDiscoverTools: p.mcpHook.discoverTools,
    onPublishServer,
    onOpenLibrary: p.onOpenMcpLibrary,
  };
}

interface AgentToolsSlotProps {
  config: AgentToolsConfig;
  sidePanelProps: SidePanelsProps;
  onPublishServer: (server: McpServerConfig) => void;
}

function AgentToolsSlot({ config, sidePanelProps: p, onPublishServer }: AgentToolsSlotProps) {
  const { groups, state: registryState } = useToolRegistry();
  const registryFailed = registryState.kind === 'total-failure';
  const toolsState = useAgentToolsState({
    agentId: config.agentId,
    initialSelectedTools: config.initialSelectedTools,
    initialUpdatedAt: config.initialUpdatedAt,
    registryFailed,
  });
  const registry = groups.flatMap((g) => g.tools.map(registryToolToSelectedTool));
  const staleEntries = findStaleSelections({
    selections: toolsState.selectedTools,
    registry,
    failedProviders: [],
  });
  const agentProp = {
    agentId: config.agentId,
    selectedTools: toolsState.selectedTools,
    staleEntries,
    saveState: toolsState.saveState,
    onChange: toolsState.handleToolsChange,
    onRemoveStale: toolsState.handleRemoveStale,
    onRetrySave: toolsState.handleRetrySave,
  };
  return (
    <ToolsPanel mcp={buildMcpProps(p, onPublishServer)} open={p.toolsOpen} onClose={() => {}} agent={agentProp} />
  );
}

function ToolsPanelSlot({ sidePanelProps: p, onPublishServer }: ToolsPanelSlotProps) {
  if (p.agentToolsConfig !== undefined && p.agentToolsConfig.appType === 'agent') {
    return (
      <AgentToolsSlot
        config={p.agentToolsConfig}
        sidePanelProps={p}
        onPublishServer={onPublishServer}
      />
    );
  }
  return (
    <ToolsPanel mcp={buildMcpProps(p, onPublishServer)} open={p.toolsOpen} onClose={() => {}} />
  );
}

export function SidePanels(props: SidePanelsProps) {
  const { selection, simulation, globalPanelOpen, libraryOpen, schemaDialog } = props;
  const isVirtualNode = selection.selectedNodeId !== null && selection.selectedNodeId.startsWith('step-');
  const hasSelection = !isVirtualNode && (selection.selectedNodeId !== null || selection.selectedEdgeId !== null);
  const showSelectionPanel = !simulation.active && hasSelection;

  const publish = usePublishState(props.mcpHook);
  const installedIds = getInstalledLibraryIds(props.mcpHook.servers);

  const readOnlyClass = props.readOnly === true ? '[&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_button]:pointer-events-none [&_[role=checkbox]]:pointer-events-none [&_select]:pointer-events-none [&_[role=combobox]]:pointer-events-none' : '';

  return (
    <div className={`pointer-events-auto ${readOnlyClass}`}>
      <OutputSchemaDialog
        schema={schemaDialog.editingSchema}
        agentId={props.agentId}
        onSave={props.outputSchemasHook.updateSchema}
        onSaved={schemaDialog.handleSchemaSaved}
        open={schemaDialog.editingSchemaId !== null}
        onOpenChange={(open) => {
          if (!open) schemaDialog.handleSchemaDialogClose();
        }}
      />
      <McpDialogs
        publishServer={publish.publishServer}
        orgId={props.orgId}
        onPublishClose={() => publish.setPublishServer(null)}
        onPublished={() => publish.setPublishServer(null)}
        libraryOpen={libraryOpen}
        mcpLibrary={props.mcpLibrary}
        installedLibraryIds={installedIds}
        onInstall={publish.handleInstallFromLibrary}
      />
      {showSelectionPanel && (
        <SelectionPanel
          {...props}
          onEditSchema={schemaDialog.handleEditSchema}
          onEditNewSchema={schemaDialog.handleEditNewSchema}
        />
      )}
      {globalPanelOpen && (
        <GlobalPanel
          setNodes={props.setNodes}
          setEdges={props.setEdges}
          nodes={props.nodes}
          pushOperation={props.pushOperation}
        />
      )}
      <ToolsPanelSlot sidePanelProps={props} onPublishServer={publish.setPublishServer} />
    </div>
  );
}
