'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useReactFlow, ReactFlowProvider, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { HandleContext } from './nodes/HandleContext';
import { PublishButton } from './panels/PublishButton';
import { Toolbar } from './panels/Toolbar';
import { StatusButton } from './panels/StatusButton';
import { ConnectionMenu } from './panels/ConnectionMenu';
import { SearchDialog } from './panels/SearchDialog';
import { VersionSwitcherSlot } from './panels/VersionSwitcherSlot';
import { GraphCanvas } from './GraphCanvas';
import { SidePanels } from './SidePanels';
import type { ApiKeyRow } from '../lib/api-keys';
import type { Agent, Graph } from '../schemas/graph.schema';
import { useApiKeySelection } from '../hooks/useApiKeySelection';
import { useAutoSave } from '../hooks/useAutoSave';
import { useGraphActions } from '../hooks/useGraphActions';
import type { GraphLoadResult } from '../hooks/useGraphLoader';
import { useGraphLoader } from '../hooks/useGraphLoader';
import { useImportGraph } from '../hooks/useImportGraph';
import { useExportGraph } from '../hooks/useExportGraph';
import { useGraphSelection } from '../hooks/useGraphSelection';
import { useMcpServers } from '../hooks/useMcpServers';
import { useOperationQueue } from '../hooks/useOperationQueue';
import { usePresets } from '../hooks/usePresets';
import { useSimulation } from '../hooks/useSimulation';
import { useVersions } from '../hooks/useVersions';
import { useZoomView } from '../hooks/useZoomView';
import { useInitialViewport, useSearchKeyboard, useContextPreconditions } from '../hooks/useGraphBuilderHelpers';
import { serializeGraphData } from '../utils/graphSerializer';
import type { RFNodeData } from '../utils/graphTransformers';

const DEFAULT_VERSION = 0;

export interface GraphBuilderProps {
  agentId?: string;
  agentName?: string;
  orgSlug?: string;
  orgName?: string;
  orgAvatarUrl?: string | null;
  initialVersion?: number;
  orgApiKeys?: ApiKeyRow[];
  stagingApiKeyId?: string | null;
  productionApiKeyId?: string | null;
}

interface LoadedEditorProps extends GraphBuilderProps {
  loadResult: GraphLoadResult;
  reload: () => void;
}

function useGraphBuilderHooks(props: LoadedEditorProps) {
  const { agentId, loadResult } = props;
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(loadResult.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(loadResult.edges);
  const [agents] = useState<Agent[]>(loadResult.agents);
  const [version, setVersion] = useState(props.initialVersion ?? DEFAULT_VERSION);

  const opQueue = useOperationQueue(agentId);

  const mcpHook = useMcpServers(loadResult.mcpServers, opQueue.pushOperation);

  const apiKeys = useApiKeySelection({
    agentId,
    initialStagingKeyId: props.stagingApiKeyId ?? null,
    initialProductionKeyId: props.productionApiKeyId ?? null,
  });

  const [globalPanelOpen, setGlobalPanelOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const presetsHook = usePresets(opQueue.pushOperation);

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
    pushOperation: opQueue.pushOperation,
  });

  const handleImport = useImportGraph({
    setNodes,
    setEdges,
    setViewport: rf.setViewport,
    reactFlowWrapper,
    mcpSetServers: mcpHook.setServers,
  });

  const handleExport = useExportGraph({ nodes, edges, agents, mcpServers: mcpHook.servers });

  const serializedGraph = useMemo(
    () => serializeGraphData({ nodes, edges, agents, mcpServers: mcpHook.servers }),
    [nodes, edges, agents, mcpHook.servers]
  );

  const getGraphData = useCallback((): Graph | null => serializedGraph, [serializedGraph]);

  const { pendingSave } = useAutoSave({
    hasPendingOps: opQueue.hasPendingOps,
    flush: opQueue.flush,
    enabled: agentId !== undefined,
  });

  const canPublish = serializedGraph !== null;

  useInitialViewport(reactFlowWrapper, rf.setViewport, loadResult.graphData);
  useSearchKeyboard(setSearchOpen);

  const simulation = useSimulation({
    allNodes: nodes,
    edges,
    agents,
    preset: presetsHook.activePreset,
    apiKeyId: apiKeys.stagingKeyId ?? '',
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
    apiKeys,
    pushOperation: opQueue.pushOperation,
    hasPendingOps: opQueue.hasPendingOps,
    clearQueue: opQueue.clearQueue,
  };
}

function GraphBuilderLoading() {
  const t = useTranslations('common');

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Loader2 className="mr-2 size-6 animate-spin" />
      <span>{t('loading')}</span>
    </div>
  );
}

function LoadedEditor(props: LoadedEditorProps) {
  const h = useGraphBuilderHooks(props);
  const versionsHook = useVersions(props.agentId, props.initialVersion ?? DEFAULT_VERSION);

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
          stagingKeyId={h.apiKeys.stagingKeyId}
          orgSlug={props.orgSlug}
          orgName={props.orgName}
          orgAvatarUrl={props.orgAvatarUrl}
          agentName={props.agentName}
          publishSlot={
            props.agentId !== undefined ? (
              <PublishButton
                agentId={props.agentId}
                canPublish={h.canPublish}
                hasApiKey={h.apiKeys.stagingKeyId !== null}
                onPublished={(newVersion) => {
                  h.setVersion(newVersion);
                  versionsHook.setCurrentVersion(newVersion);
                  h.apiKeys.setProductionKeyId(h.apiKeys.stagingKeyId);
                  void versionsHook.refresh();
                }}
              />
            ) : undefined
          }
          versionSlot={
            props.agentId !== undefined ? (
              <VersionSwitcherSlot
                agentId={props.agentId}
                versionsHook={versionsHook}
                hasPendingOps={h.hasPendingOps}
                clearQueue={h.clearQueue}
                reload={props.reload}
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
          orgApiKeys={props.orgApiKeys ?? []}
          stagingKeyId={h.apiKeys.stagingKeyId}
          productionKeyId={h.apiKeys.productionKeyId}
          onStagingKeyChange={h.apiKeys.handleStagingKeyChange}
          pushOperation={h.pushOperation}
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

function GraphBuilderInner(props: GraphBuilderProps) {
  const loader = useGraphLoader(props.agentId);

  if (loader.loading) return <GraphBuilderLoading />;

  return <LoadedEditor {...props} loadResult={loader.result} reload={loader.reload} />;
}

export function GraphBuilder(props: GraphBuilderProps) {
  return (
    <ReactFlowProvider>
      <GraphBuilderInner {...props} />
    </ReactFlowProvider>
  );
}
