'use client';

import type { Edge } from '@xyflow/react';
import { useState } from 'react';

import type { ApiKeyRow } from '../lib/api-keys';
import type { Agent } from '../schemas/graph.schema';
import type { McpServersState } from '../hooks/useMcpServers';
import type { OutputSchemasState } from '../hooks/useOutputSchemas';
import type { PushOperation } from '../utils/operationBuilders';
import type { RFEdgeData } from '../utils/graphTransformers';
import type { UseGraphSelectionReturn } from '../hooks/useGraphSelection';
import type { ContextPreset } from '../types/preset';

import { EdgePanel } from './panels/EdgePanel';
import { GlobalNodesPanel } from './panels/GlobalNodesPanel';
import { NodePanel } from './panels/NodePanel';
import { OutputSchemaDialog } from './panels/OutputSchemaDialog';
import { PresetsPanel } from './panels/PresetsPanel';
import { ToolsPanel } from './panels/ToolsPanel';
import type { CtxPreconditionsState, EdgeSetter, NodeArray, NodeSetter } from './sidePanelHelpers';
import {
  createPrecondition,
  handleGlobalAddNode,
  handleGlobalDeleteNode,
  handleGlobalSetFallback,
  handleGlobalUpdateNode,
  handlePreconditionRemove,
  handlePreconditionUpdate,
} from './sidePanelHelpers';

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
  setNodes: NodeSetter;
  setEdges: EdgeSetter;
  ctxPreconditions: CtxPreconditionsState;
  orgApiKeys: ApiKeyRow[];
  stagingKeyId: string | null;
  productionKeyId: string | null;
  onStagingKeyChange: (keyId: string | null) => void;
  pushOperation: PushOperation;
}

interface SelectionPanelProps extends SidePanelsProps {
  onEditSchema: (id: string) => void;
}

function SelectionPanel(props: SelectionPanelProps) {
  const { selection, nodes, agents, presetsHook, ctxPreconditions, pushOperation } = props;

  return (
    <aside className="absolute right-0 top-0 bottom-0 z-10 w-80 border-l border-gray-200 bg-white">
      {selection.selectedNodeId !== null && (
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
        />
      )}
      {selection.selectedEdgeId !== null && (
        <EdgePanel
          edgeId={selection.selectedEdgeId}
          onEdgeDeleted={() => selection.setSelectedEdgeId(null)}
          availableContextPreconditions={ctxPreconditions.allContextPreconditions}
          availableMcpTools={props.mcpHook.allTools}
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
    <aside className="absolute right-0 top-0 bottom-0 z-10 w-80 border-l border-gray-200 bg-white">
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

type PresetsAsideProps = Pick<
  SidePanelsProps,
  | 'presetsHook'
  | 'ctxPreconditions'
  | 'setEdges'
  | 'orgApiKeys'
  | 'stagingKeyId'
  | 'productionKeyId'
  | 'onStagingKeyChange'
  | 'outputSchemasHook'
> & { onEditSchema: (id: string) => void; onRemoveSchema: (id: string) => void };

function PresetsAside(props: PresetsAsideProps) {
  const { presetsHook, ctxPreconditions, setEdges } = props;

  return (
    <aside className="absolute left-0 top-0 bottom-0 w-80 border-r border-gray-200 bg-white z-10">
      <PresetsPanel
        presets={presetsHook.presets}
        contextKeys={presetsHook.contextKeys}
        orgApiKeys={props.orgApiKeys}
        stagingKeyId={props.stagingKeyId}
        productionKeyId={props.productionKeyId}
        onStagingKeyChange={props.onStagingKeyChange}
        onAdd={presetsHook.addPreset}
        onDelete={presetsHook.deletePreset}
        onUpdate={presetsHook.updatePreset}
        context={{
          keys: presetsHook.contextKeys,
          onAdd: presetsHook.addContextKey,
          onRemove: presetsHook.removeContextKey,
          onRename: presetsHook.renameContextKey,
        }}
        contextPreconditions={{
          preconditions: ctxPreconditions.customContextPreconditions,
          onAdd: () => createPrecondition(ctxPreconditions),
          onRemove: (id) => handlePreconditionRemove(id, ctxPreconditions, setEdges),
          onUpdate: (id, updates) => handlePreconditionUpdate(id, updates, ctxPreconditions, setEdges),
        }}
        outputSchemas={{
          schemas: props.outputSchemasHook.schemas,
          onAdd: () => {
            const id = props.outputSchemasHook.addSchema();
            props.onEditSchema(id);
          },
          onRemove: props.onRemoveSchema,
          onEdit: props.onEditSchema,
        }}
      />
    </aside>
  );
}

export function SidePanels(props: SidePanelsProps) {
  const { selection, simulation, globalPanelOpen, presetsOpen, toolsOpen } = props;
  const hasSelection = selection.selectedNodeId !== null || selection.selectedEdgeId !== null;
  const showSelectionPanel = !simulation.active && hasSelection;

  const [editingSchemaId, setEditingSchemaId] = useState<string | null>(null);
  const editingSchema =
    editingSchemaId !== null
      ? props.outputSchemasHook.schemas.find((s) => s.id === editingSchemaId)
      : undefined;

  const handleRemoveSchema = (id: string) => {
    props.outputSchemasHook.removeSchema(id);
    props.setNodes((nds) =>
      nds.map((n) => (n.data.outputSchemaId === id ? { ...n, data: { ...n.data, outputSchemaId: undefined } } : n))
    );
  };

  return (
    <>
      <OutputSchemaDialog
        schema={editingSchema}
        onSave={props.outputSchemasHook.updateSchema}
        open={editingSchemaId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingSchemaId(null);
        }}
      />
      {showSelectionPanel && <SelectionPanel {...props} onEditSchema={setEditingSchemaId} />}
      {globalPanelOpen && (
        <GlobalPanel
          setNodes={props.setNodes}
          setEdges={props.setEdges}
          nodes={props.nodes}
          pushOperation={props.pushOperation}
        />
      )}
      <ToolsPanel
        servers={props.mcpHook.servers}
        discoveredTools={props.mcpHook.discoveredTools}
        mcp={{
          servers: props.mcpHook.servers,
          discovering: props.mcpHook.discovering,
          serverStatus: props.mcpHook.serverStatus,
          onAddServer: props.mcpHook.addServer,
          onRemoveServer: props.mcpHook.removeServer,
          onUpdateServer: props.mcpHook.updateServer,
          onDiscoverTools: props.mcpHook.discoverTools,
        }}
        open={toolsOpen}
        onClose={() => {}}
      />
      {presetsOpen && (
        <PresetsAside
          presetsHook={props.presetsHook}
          ctxPreconditions={props.ctxPreconditions}
          setEdges={props.setEdges}
          orgApiKeys={props.orgApiKeys}
          stagingKeyId={props.stagingKeyId}
          productionKeyId={props.productionKeyId}
          onStagingKeyChange={props.onStagingKeyChange}
          outputSchemasHook={props.outputSchemasHook}
          onEditSchema={setEditingSchemaId}
          onRemoveSchema={handleRemoveSchema}
        />
      )}
    </>
  );
}
