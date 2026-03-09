'use client';

import type { Edge, Node } from '@xyflow/react';
import { nanoid } from 'nanoid';

import type { ApiKeyRow } from '../lib/api-keys';
import type { Agent } from '../schemas/graph.schema';
import type { McpServersState } from '../hooks/useMcpServers';
import type { ContextPrecondition } from '../types/contextPrecondition';
import { createEmptyGroup } from '../types/contextPrecondition';
import { DEFAULT_NODE_WIDTH } from '../utils/graphInitializer';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import type { UseGraphSelectionReturn } from '../hooks/useGraphSelection';
import type { ContextPreset } from '../types/preset';

import { NodePanel } from './panels/NodePanel';
import { EdgePanel } from './panels/EdgePanel';
import { GlobalNodesPanel } from './panels/GlobalNodesPanel';
import { PresetsPanel } from './panels/PresetsPanel';
import { ToolsPanel } from './panels/ToolsPanel';

const NANOID_LENGTH = 8;
const NAME_SLICE_END = 4;

type NodeArray = Array<Node<RFNodeData>>;
type EdgeArray = Array<Edge<RFEdgeData>>;
type NodeSetter = (nodes: NodeArray | ((nds: NodeArray) => NodeArray)) => void;
type EdgeSetter = (edges: EdgeArray | ((eds: EdgeArray) => EdgeArray)) => void;

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

interface CtxPreconditionsState {
  customContextPreconditions: ContextPrecondition[];
  setCustomContextPreconditions: React.Dispatch<React.SetStateAction<ContextPrecondition[]>>;
  allContextPreconditions: string[];
}

export interface SidePanelsProps {
  selection: UseGraphSelectionReturn;
  simulation: { active: boolean };
  nodes: NodeArray;
  edges: EdgeArray;
  agents: Agent[];
  presetsHook: PresetsHook;
  mcpHook: McpServersState;
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
}

function resolveApiKey(orgApiKeys: ApiKeyRow[], stagingKeyId: string | null): string {
  if (stagingKeyId === null) return '';
  const found = orgApiKeys.find((k) => k.id === stagingKeyId);
  return found?.key_value ?? '';
}

function SelectionPanel(props: SidePanelsProps) {
  const { selection, nodes, agents, presetsHook, mcpHook, ctxPreconditions, orgApiKeys, stagingKeyId } = props;

  return (
    <aside className="absolute right-0 top-0 bottom-0 w-80 border-l border-gray-200 bg-white">
      {selection.selectedNodeId !== null && (
        <NodePanel
          nodeId={selection.selectedNodeId}
          allNodes={nodes}
          agents={agents}
          presets={presetsHook.presets}
          activePresetId={presetsHook.activePresetId}
          apiKey={resolveApiKey(orgApiKeys, stagingKeyId)}
          globalNodeIds={nodes.filter((n) => n.data.global === true).map((n) => n.id)}
          onSetActivePreset={presetsHook.setActivePresetId}
          onNodeDeleted={() => selection.setSelectedNodeId(null)}
          onNodeIdChanged={(newId) => selection.setSelectedNodeId(newId)}
          onSelectEdge={selection.selectEdge}
          onSelectNode={selection.navigateToNode}
        />
      )}
      {selection.selectedEdgeId !== null && (
        <EdgePanel
          edgeId={selection.selectedEdgeId}
          onEdgeDeleted={() => selection.setSelectedEdgeId(null)}
          availableContextPreconditions={ctxPreconditions.allContextPreconditions}
          availableMcpTools={mcpHook.allToolNames}
          onSelectNode={selection.navigateToNode}
        />
      )}
    </aside>
  );
}

function GlobalPanel({ setNodes, setEdges, nodes }: Pick<SidePanelsProps, 'setNodes' | 'setEdges' | 'nodes'>) {
  return (
    <aside className="absolute right-0 top-0 bottom-0 w-80 border-l border-gray-200 bg-white">
      <GlobalNodesPanel
        nodes={nodes}
        onAddNode={() => {
          const id = `node_${nanoid(NANOID_LENGTH)}`;
          const newNode: Node<RFNodeData> = {
            id,
            type: 'agent',
            position: { x: 0, y: 0 },
            data: { nodeId: id, text: 'New global node', description: '', global: true, nodeWidth: DEFAULT_NODE_WIDTH },
          };
          setNodes((nds) => [...nds, newNode]);
        }}
        onDeleteNode={(nodeId) => {
          setNodes((nds) => nds.filter((n) => n.id !== nodeId));
          setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        }}
        onUpdateNode={(nodeId, updates) => {
          setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)));
        }}
        onSetDefaultFallback={(nodeId) => {
          setNodes((nds) =>
            nds.map((n) => ({
              ...n,
              data: { ...n.data, defaultFallback: n.id === nodeId ? true : undefined },
            }))
          );
        }}
      />
    </aside>
  );
}

function handlePreconditionRemove(
  id: string,
  ctx: CtxPreconditionsState,
  setEdges: EdgeSetter
): void {
  const target = ctx.customContextPreconditions.find((p) => p.id === id);
  ctx.setCustomContextPreconditions((prev) => prev.filter((p) => p.id !== id));
  if (target === undefined) return;
  setEdges((eds) =>
    eds.map((e) => {
      const cp = (e.data as RFEdgeData | undefined)?.contextPreconditions;
      if (cp === undefined) return e;
      const filtered = cp.preconditions.filter((p) => p !== target.name);
      return {
        ...e,
        data: { ...e.data, contextPreconditions: filtered.length > 0 ? { ...cp, preconditions: filtered } : undefined },
      };
    })
  );
}

function handlePreconditionUpdate(
  id: string,
  updates: Partial<ContextPrecondition>,
  ctx: CtxPreconditionsState,
  setEdges: EdgeSetter
): void {
  const old = ctx.customContextPreconditions.find((p) => p.id === id);
  ctx.setCustomContextPreconditions((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  if (updates.name !== undefined && old !== undefined && updates.name !== old.name) {
    setEdges((eds) =>
      eds.map((e) => {
        const cp = (e.data as RFEdgeData | undefined)?.contextPreconditions;
        if (cp === undefined) return e;
        const renamed = cp.preconditions.map((p) => (p === old.name ? updates.name! : p));
        return { ...e, data: { ...e.data, contextPreconditions: { ...cp, preconditions: renamed } } };
      })
    );
  }
}

type PresetsAsideProps = Pick<
  SidePanelsProps,
  'presetsHook' | 'mcpHook' | 'ctxPreconditions' | 'setEdges' | 'orgApiKeys' | 'stagingKeyId' | 'productionKeyId' | 'onStagingKeyChange'
>;

function PresetsAside(props: PresetsAsideProps) {
  const { presetsHook, mcpHook, ctxPreconditions, setEdges } = props;

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
          onAdd: () => {
            const id = nanoid();
            const name = `precondition_${id.slice(0, NAME_SLICE_END)}`;
            ctxPreconditions.setCustomContextPreconditions((prev) => [...prev, { id, name, root: createEmptyGroup() }]);
          },
          onRemove: (id) => handlePreconditionRemove(id, ctxPreconditions, setEdges),
          onUpdate: (id, updates) => handlePreconditionUpdate(id, updates, ctxPreconditions, setEdges),
        }}
        mcp={{
          servers: mcpHook.servers,
          discovering: mcpHook.discovering,
          serverStatus: mcpHook.serverStatus,
          onAddServer: mcpHook.addServer,
          onRemoveServer: mcpHook.removeServer,
          onUpdateServer: mcpHook.updateServer,
          onDiscoverTools: mcpHook.discoverTools,
        }}
      />
    </aside>
  );
}

export function SidePanels(props: SidePanelsProps) {
  const { selection, simulation, globalPanelOpen, presetsOpen, toolsOpen } = props;
  const hasSelection = selection.selectedNodeId !== null || selection.selectedEdgeId !== null;
  const showSelectionPanel = !simulation.active && hasSelection;

  return (
    <>
      {showSelectionPanel && <SelectionPanel {...props} />}
      {globalPanelOpen && <GlobalPanel setNodes={props.setNodes} setEdges={props.setEdges} nodes={props.nodes} />}
      <ToolsPanel servers={props.mcpHook.servers} discoveredTools={props.mcpHook.discoveredTools} open={toolsOpen} onClose={() => {}} />
      {presetsOpen && (
        <PresetsAside
          presetsHook={props.presetsHook}
          mcpHook={props.mcpHook}
          ctxPreconditions={props.ctxPreconditions}
          setEdges={props.setEdges}
          orgApiKeys={props.orgApiKeys}
          stagingKeyId={props.stagingKeyId}
          productionKeyId={props.productionKeyId}
          onStagingKeyChange={props.onStagingKeyChange}
        />
      )}
    </>
  );
}
