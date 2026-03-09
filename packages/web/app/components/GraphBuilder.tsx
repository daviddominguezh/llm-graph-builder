'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useReactFlow, ReactFlowProvider, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { HandleContext } from './nodes/HandleContext';
import { PublishButton } from './panels/PublishButton';
import { Toolbar } from './panels/Toolbar';
import { StatusButton } from './panels/StatusButton';
import { ConnectionMenu } from './panels/ConnectionMenu';
import { SearchDialog } from './panels/SearchDialog';
import { GraphCanvas } from './GraphCanvas';
import { SidePanels } from './SidePanels';
import type { Agent, Graph } from '../schemas/graph.schema';
import { useMcpServers } from '../hooks/useMcpServers';
import { usePresets } from '../hooks/usePresets';
import { useSimulation } from '../hooks/useSimulation';
import { useAutoSave } from '../hooks/useAutoSave';
import { useGraphActions } from '../hooks/useGraphActions';
import { useImportGraph } from '../hooks/useImportGraph';
import { useExportGraph } from '../hooks/useExportGraph';
import { useGraphSelection } from '../hooks/useGraphSelection';
import { useZoomView } from '../hooks/useZoomView';
import { useInitialViewport, useSearchKeyboard, useContextPreconditions } from '../hooks/useGraphBuilderHelpers';
import { buildInitialEdges, buildInitialNodes } from '../utils/graphInitializer';
import { serializeGraphData } from '../utils/graphSerializer';
import type { RFNodeData } from '../utils/graphTransformers';

const DEFAULT_VERSION = 0;

export interface GraphBuilderProps {
  agentId?: string;
  agentName?: string;
  initialGraphData?: Graph;
  initialProductionData?: Graph;
  initialVersion?: number;
}

function useGraphBuilderHooks(props: GraphBuilderProps) {
  const { agentId, initialGraphData, initialProductionData, initialVersion } = props;
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();

  const initNodes = useMemo(() => buildInitialNodes(initialGraphData), [initialGraphData]);
  const initEdges = useMemo(() => buildInitialEdges(initialGraphData), [initialGraphData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const [agents] = useState<Agent[]>(initialGraphData?.agents ?? []);
  const [version, setVersion] = useState(initialVersion ?? DEFAULT_VERSION);
  const [productionData, setProductionData] = useState(initialProductionData);

  const [globalPanelOpen, setGlobalPanelOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const presetsHook = usePresets();
  const mcpHook = useMcpServers();

  const panels = useMemo(() => ({ setGlobalPanelOpen, setPresetsOpen, setToolsOpen, setSearchOpen }), []);

  const selection = useGraphSelection(
    { nodes, setNodes, setEdges, reactFlow: rf, reactFlowWrapper },
    panels
  );

  const zoomView = useZoomView({
    nodes,
    edges,
    setNodes,
    setEdges,
    setSelectedNodeId: selection.setSelectedNodeId,
    setSelectedEdgeId: selection.setSelectedEdgeId,
    reactFlow: rf,
  });

  const graphActions = useGraphActions({
    nodes,
    edges,
    setNodes,
    setEdges,
    setSelectedNodeId: selection.setSelectedNodeId,
    reactFlowWrapper,
    reactFlow: rf,
  });

  const handleImport = useImportGraph({
    setNodes,
    setEdges,
    setViewport: rf.setViewport,
    reactFlowWrapper,
    mcpSetServers: mcpHook.setServers,
  });

  const handleExport = useExportGraph({ nodes, edges, agents, mcpServers: mcpHook.servers });

  const getGraphData = useCallback(
    (): Graph | null => serializeGraphData({ nodes, edges, agents, mcpServers: mcpHook.servers }),
    [nodes, edges, agents, mcpHook.servers]
  );

  const { pendingSave } = useAutoSave({ agentId, getGraphData, enabled: agentId !== undefined });

  const canPublish = useMemo(() => {
    const currentData = getGraphData();
    if (currentData === null) return false;
    return JSON.stringify(currentData) !== JSON.stringify(productionData);
  }, [getGraphData, productionData]);

  useInitialViewport(reactFlowWrapper, rf.setViewport, initialGraphData);
  useSearchKeyboard(setSearchOpen);

  const simulation = useSimulation({
    allNodes: nodes,
    edges,
    agents,
    preset: presetsHook.activePreset,
    apiKey: presetsHook.apiKey,
    mcpServers: mcpHook.servers,
    onZoomToNode: zoomView.handleZoomToNode,
    onExitZoomView: zoomView.handleExitZoomView,
  });

  const ctxPreconditions = useContextPreconditions(edges);

  const displayNodes = nodes.filter((n) => (n.data as RFNodeData).global !== true);

  return {
    reactFlowWrapper,
    nodes,
    edges,
    agents,
    onNodesChange,
    onEdgesChange,
    setNodes,
    setEdges,
    displayNodes,
    selection,
    zoomView,
    graphActions,
    handleImport,
    handleExport,
    getGraphData,
    pendingSave,
    canPublish,
    simulation,
    presetsHook,
    mcpHook,
    ctxPreconditions,
    globalPanelOpen,
    setGlobalPanelOpen,
    presetsOpen,
    setPresetsOpen,
    toolsOpen,
    setToolsOpen,
    searchOpen,
    setSearchOpen,
    version,
    setVersion,
    productionData,
    setProductionData,
  };
}

function GraphBuilderInner(props: GraphBuilderProps) {
  const h = useGraphBuilderHooks(props);

  const handleContextValue = {
    onSourceHandleClick: h.graphActions.onSourceHandleClick,
    onZoomToNode: h.zoomView.handleZoomToNode,
  };

  return (
    <HandleContext.Provider value={handleContextValue}>
      <div className="flex h-screen w-screen flex-col items-center">
        <Toolbar
          onAddNode={h.graphActions.handleAddNode}
          onImport={h.handleImport}
          onExport={h.handleExport}
          onPlay={h.simulation.start}
          simulationActive={h.simulation.active}
          statusSlot={<StatusButton nodes={h.nodes} edges={h.edges} />}
          globalPanelOpen={h.globalPanelOpen}
          onToggleGlobalPanel={() => h.setGlobalPanelOpen((prev) => !prev)}
          onTogglePresets={() => h.setPresetsOpen((prev) => !prev)}
          onToggleTools={() => h.setToolsOpen((prev) => !prev)}
          pendingSave={h.pendingSave}
          publishSlot={
            props.agentId !== undefined ? (
              <PublishButton
                agentId={props.agentId}
                canPublish={h.canPublish}
                onPublished={(newVersion) => {
                  h.setVersion(newVersion);
                  h.setProductionData(h.getGraphData() ?? undefined);
                }}
              />
            ) : undefined
          }
        />

        <GraphCanvas
          reactFlowWrapper={h.reactFlowWrapper}
          displayNodes={h.displayNodes}
          edges={h.edges}
          onNodesChange={h.onNodesChange}
          onEdgesChange={h.onEdgesChange}
          onConnect={h.graphActions.onConnect}
          onNodeClick={h.selection.onNodeClick}
          onEdgeClick={h.selection.onEdgeClick}
          onPaneClick={h.selection.onPaneClick}
          zoomViewNodeId={h.zoomView.zoomViewNodeId}
          simulation={h.simulation}
          onExitZoomView={h.zoomView.handleExitZoomView}
        />

        <SearchDialog
          nodes={h.nodes.map((n) => ({ id: n.id, text: (n.data as RFNodeData).text }))}
          open={h.searchOpen}
          onClose={() => h.setSearchOpen(false)}
          onSelectNode={h.selection.handleSearchSelectNode}
        />

        <SidePanels
          selection={h.selection}
          simulation={h.simulation}
          nodes={h.nodes}
          edges={h.edges}
          agents={h.agents}
          presetsHook={h.presetsHook}
          mcpHook={h.mcpHook}
          globalPanelOpen={h.globalPanelOpen}
          presetsOpen={h.presetsOpen}
          toolsOpen={h.toolsOpen}
          setNodes={h.setNodes}
          setEdges={h.setEdges}
          ctxPreconditions={h.ctxPreconditions}
        />

        {h.graphActions.connectionMenu !== null && (
          <ConnectionMenu
            position={h.graphActions.connectionMenu.position}
            sourceNodeId={h.graphActions.connectionMenu.sourceNodeId}
            sourceHandleId={h.graphActions.connectionMenu.sourceHandleId}
            nodes={h.nodes.map((n) => ({ id: n.id, text: (n.data as RFNodeData).text }))}
            onSelectNode={h.graphActions.handleConnectionMenuSelectNode}
            onCreateNode={h.graphActions.handleConnectionMenuCreateNode}
            onClose={h.graphActions.handleConnectionMenuClose}
          />
        )}
      </div>
    </HandleContext.Provider>
  );
}

export function GraphBuilder(props: GraphBuilderProps) {
  return (
    <ReactFlowProvider>
      <GraphBuilderInner {...props} />
    </ReactFlowProvider>
  );
}
