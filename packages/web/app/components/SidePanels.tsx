'use client';

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

import { START_NODE_ID } from '../utils/graphInitializer';
import { EdgePanel } from './panels/EdgePanel';
import { GlobalNodesPanel } from './panels/GlobalNodesPanel';
import { NodePanel } from './panels/NodePanel';
import { OutputSchemaDialog } from './panels/OutputSchemaDialog';
import { StartNodePanel } from './panels/StartNodePanel';
import { ToolsPanel } from './panels/ToolsPanel';
import { McpDialogs, PresetsAside } from './SidePanelAsides';
import type { CtxPreconditionsState, EdgeSetter, NodeArray, NodeSetter } from './sidePanelHelpers';
import {
  handleGlobalAddNode,
  handleGlobalDeleteNode,
  handleGlobalSetFallback,
  handleGlobalUpdateNode,
} from './sidePanelHelpers';
import { getInstalledLibraryIds } from './sidePanelMcpHelpers';
import { usePublishState, useSchemaDialogState } from './useSidePanelState';

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
  selection: UseGraphSelectionReturn;
  simulation: { active: boolean };
  nodes: NodeArray;
  edges: EdgeArray;
  agents: Agent[];
  presetsHook: PresetsHook;
  mcpHook: McpServersState;
  outputSchemasHook: OutputSchemasState;
  globalPanelOpen: boolean;
  presetsOpen: boolean;
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
}

interface SelectionPanelProps extends SidePanelsProps {
  onEditSchema: (id: string) => void;
  onEditNewSchema: (id: string) => void;
}

function SelectionPanel(props: SelectionPanelProps) {
  const { selection, nodes, agents, presetsHook, ctxPreconditions, pushOperation } = props;
  const isStartNode = selection.selectedNodeId === START_NODE_ID;

  return (
    <aside className="absolute right-0 top-0 bottom-0 z-10 w-80 border-border bg-background border-l rounded-s-md shadow-sm">
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
          availableMcpTools={props.mcpHook.allTools}
          mcpServers={props.mcpHook.servers}
          mcpDiscoveredTools={props.mcpHook.discoveredTools}
          onSelectNode={selection.navigateToNode}
          pushOperation={pushOperation}
        />
      )}
    </aside>
  );
}

type GlobalPanelProps = Pick<SidePanelsProps, 'setNodes' | 'setEdges' | 'nodes' | 'pushOperation'>;

function GlobalPanel({ setNodes, setEdges, nodes, pushOperation }: GlobalPanelProps) {
  return (
    <aside className="absolute right-0 top-0 bottom-0 z-10 w-80 border-border bg-background border-l rounded-s-md">
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
    </aside>
  );
}

interface ToolsPanelSlotProps {
  sidePanelProps: SidePanelsProps;
  onPublishServer: (server: McpServerConfig) => void;
}

function ToolsPanelSlot({ sidePanelProps: p, onPublishServer }: ToolsPanelSlotProps) {
  return (
    <ToolsPanel
      servers={p.mcpHook.servers}
      discoveredTools={p.mcpHook.discoveredTools}
      mcp={{
        servers: p.mcpHook.servers,
        discovering: p.mcpHook.discovering,
        serverStatus: p.mcpHook.serverStatus,
        orgId: p.orgId,
        envVariables: p.envVariables,
        libraryItems: p.mcpLibrary.items,
        onAddServer: p.mcpHook.addServer,
        onRemoveServer: p.mcpHook.removeServer,
        onUpdateServer: p.mcpHook.updateServer,
        onDiscoverTools: p.mcpHook.discoverTools,
        onPublishServer,
        onOpenLibrary: p.onOpenMcpLibrary,
      }}
      open={p.toolsOpen}
      onClose={() => {}}
    />
  );
}

export function SidePanels(props: SidePanelsProps) {
  const { selection, simulation, globalPanelOpen, presetsOpen, libraryOpen } = props;
  const hasSelection = selection.selectedNodeId !== null || selection.selectedEdgeId !== null;
  const showSelectionPanel = !simulation.active && hasSelection;

  const schema = useSchemaDialogState({
    outputSchemasHook: props.outputSchemasHook,
    selection: props.selection,
    setNodes: props.setNodes,
  });

  const publish = usePublishState(props.mcpHook);
  const installedIds = getInstalledLibraryIds(props.mcpHook.servers);

  return (
    <>
      <OutputSchemaDialog
        schema={schema.editingSchema}
        onSave={props.outputSchemasHook.updateSchema}
        onSaved={schema.handleSchemaSaved}
        open={schema.editingSchemaId !== null}
        onOpenChange={(open) => {
          if (!open) schema.handleSchemaDialogClose();
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
          onEditSchema={schema.handleEditSchema}
          onEditNewSchema={schema.handleEditNewSchema}
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
      {presetsOpen && !libraryOpen && (
        <PresetsAside
          presetsHook={props.presetsHook}
          ctxPreconditions={props.ctxPreconditions}
          setEdges={props.setEdges}
          orgApiKeys={props.orgApiKeys}
          stagingKeyId={props.stagingKeyId}
          productionKeyId={props.productionKeyId}
          onStagingKeyChange={props.onStagingKeyChange}
          onProductionKeyChange={props.onProductionKeyChange}
          outputSchemasHook={props.outputSchemasHook}
          onEditSchema={schema.handleEditSchema}
          onEditNewSchema={schema.handleEditNewSchema}
          onRemoveSchema={schema.handleRemoveSchema}
          agentId={props.agentId}
          agentName={props.agentName}
          orgSlug={props.orgSlug}
        />
      )}
    </>
  );
}
