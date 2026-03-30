'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow, ReactFlowProvider, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useRouter } from 'next/navigation';

import { AgentEditorWrapper } from './AgentEditorWrapper';
import { useCopilotContext } from './copilot/CopilotProvider';
import { GraphBuilderLoading } from './GraphBuilderLoading';
import { HandleContext } from './nodes/HandleContext';
import { DeleteConfirmDialog } from './panels/DeleteConfirmDialog';
import { PublishButton } from './panels/PublishButton';
import { Toolbar } from './panels/Toolbar';
import { StatusButton, hasMcpErrors } from './panels/StatusButton';
import { ConnectionMenu } from './panels/ConnectionMenu';
import { SearchDialog } from './panels/SearchDialog';
import { VersionSwitcherSlot } from './panels/VersionSwitcherSlot';
import { GraphCanvas } from './GraphCanvas';
import { SidePanels } from './SidePanels';
import type { DiscoveredTool } from '../lib/api';
import type { ApiKeyRow } from '../lib/apiKeys';
import type { Agent, Graph } from '../schemas/graph.schema';
import { useApiKeySelection } from '../hooks/useApiKeySelection';
import { useAgentEditorHooks } from '../hooks/useAgentEditorHooks';
import { useAutoSave } from '../hooks/useAutoSave';
import { useEnvVariables } from '../hooks/useEnvVariables';
import { useMcpLibrary } from '../hooks/useMcpLibrary';
import { useGraphActions } from '../hooks/useGraphActions';
import type { GraphLoadResult } from '../hooks/useGraphLoader';
import { useGraphLoader } from '../hooks/useGraphLoader';
import { useImportGraph } from '../hooks/useImportGraph';
import { useMcpDiscovery } from '../hooks/useMcpDiscovery';
import { useExportGraph } from '../hooks/useExportGraph';
import { useGraphSelection } from '../hooks/useGraphSelection';
import { useMcpServers } from '../hooks/useMcpServers';
import { useOperationQueue } from '../hooks/useOperationQueue';
import { useOutputSchemas } from '../hooks/useOutputSchemas';
import { usePresets } from '../hooks/usePresets';
import { useDeleteConfirmation } from '../hooks/useDeleteConfirmation';
import { useSeedInitialGraph } from '../hooks/useSeedInitialGraph';
import { useSimulation } from '../hooks/useSimulation';
import { useVersions } from '../hooks/useVersions';
import { useZoomView } from '../hooks/useZoomView';
import { useInitialViewport, useSearchKeyboard, useContextPreconditions } from '../hooks/useGraphBuilderHelpers';
import { buildInitialEdges, buildInitialNodes } from '../utils/graphInitializer';
import { serializeGraphData } from '../utils/graphSerializer';
import type { RFNodeData } from '../utils/graphTransformers';
import { useFormatGraph } from '../hooks/useFormatGraph';

const DEFAULT_VERSION = 0;

function buildLoadResultFromGraph(graph: Graph): GraphLoadResult {
  return {
    nodes: buildInitialNodes(graph),
    edges: buildInitialEdges(graph),
    agents: graph.agents,
    mcpServers: graph.mcpServers ?? [],
    outputSchemas: graph.outputSchemas ?? [],
    graphData: graph,
    agentConfig: undefined,
  };
}

export interface GraphBuilderProps {
  agentId?: string;
  agentSlug?: string;
  agentName?: string;
  orgSlug?: string;
  orgId?: string;
  orgName?: string;
  orgAvatarUrl?: string | null;
  initialVersion?: number;
  orgApiKeys?: ApiKeyRow[];
  stagingApiKeyId?: string | null;
  productionApiKeyId?: string | null;
  readOnly?: boolean;
  graphOverride?: Graph;
}

interface LoadedEditorProps extends GraphBuilderProps {
  loadResult: GraphLoadResult;
  reload: () => void;
  initialDiscoveredTools: Record<string, DiscoveredTool[]>;
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

  useSeedInitialGraph({
    graphData: loadResult.graphData,
    nodes: loadResult.nodes,
    edges: loadResult.edges,
    pushOperation: opQueue.pushOperation,
    flush: opQueue.flush,
  });

  const mcpLibrary = useMcpLibrary();

  const mcpHook = useMcpServers({
    initialServers: loadResult.mcpServers,
    initialDiscoveredTools: props.initialDiscoveredTools,
    pushOperation: opQueue.pushOperation,
    libraryItems: mcpLibrary.items,
    orgId: props.orgId,
  });

  const apiKeys = useApiKeySelection({
    agentId,
    initialStagingKeyId: props.stagingApiKeyId ?? null,
    initialProductionKeyId: props.productionApiKeyId ?? null,
  });

  const [globalPanelOpen, setGlobalPanelOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const envVariables = useEnvVariables(props.orgId);

  const presetsHook = usePresets(opQueue.pushOperation);

  const outputSchemasHook = useOutputSchemas({
    initialSchemas: loadResult.outputSchemas,
    pushOperation: opQueue.pushOperation,
  });

  const { setOpen: setCopilotOpen, onOpenRef: copilotOnOpenRef } = useCopilotContext();

  const panels = useMemo(
    () => ({
      setGlobalPanelOpen,
      setPresetsOpen,
      setToolsOpen,
      setSearchOpen,
      setLibraryOpen,
      setCopilotOpen,
    }),
    [setCopilotOpen]
  );

  const selection = useGraphSelection(
    { nodes, setNodes, setEdges, reactFlow: rf, reactFlowWrapper },
    panels
  );

  const deleteConfirmation = useDeleteConfirmation({
    nodes,
    edges,
    setNodes,
    setEdges,
    pushOperation: opQueue.pushOperation,
    onNodeDeleted: () => selection.setSelectedNodeId(null),
    onEdgeDeleted: () => selection.setSelectedEdgeId(null),
  });

  const onCopilotOpen = useCallback(() => {
    selection.setSelectedNodeId(null);
    selection.setSelectedEdgeId(null);
    setGlobalPanelOpen(false);
    setPresetsOpen(false);
    setToolsOpen(false);
  }, [selection]);

  useEffect(() => {
    copilotOnOpenRef.current = onCopilotOpen;
  }, [copilotOnOpenRef, onCopilotOpen]);

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

  const getNodes = useCallback(() => nodes, [nodes]);
  const getMcpServers = useCallback(() => mcpHook.servers, [mcpHook.servers]);

  const handleImport = useImportGraph({
    setNodes,
    setEdges,
    setViewport: rf.setViewport,
    reactFlowWrapper,
    mcpSetServers: mcpHook.setServers,
    pushOperation: opQueue.pushOperation,
    getCurrentNodes: getNodes,
    getCurrentMcpServers: getMcpServers,
  });

  const handleExport = useExportGraph({
    nodes,
    edges,
    agents,
    mcpServers: mcpHook.servers,
    outputSchemas: outputSchemasHook.schemas,
  });

  const handleFormat = useFormatGraph({
    nodes,
    edges,
    agents,
    mcpServers: mcpHook.servers,
    outputSchemas: outputSchemasHook.schemas,
    setNodes,
    setEdges,
    pushOperation: opQueue.pushOperation,
  });

  const serializedGraph = useMemo(
    () => serializeGraphData({ nodes, edges, agents, mcpServers: mcpHook.servers, outputSchemas: outputSchemasHook.schemas }),
    [nodes, edges, agents, mcpHook.servers, outputSchemasHook.schemas]
  );

  const getGraphData = useCallback((): Graph | null => serializedGraph, [serializedGraph]);

  const { pendingSave } = useAutoSave({
    hasPendingOps: opQueue.hasPendingOps,
    flushSeq: opQueue.flushSeq,
    flush: opQueue.flush,
    enabled: agentId !== undefined && props.readOnly !== true,
  });

  const mcpHealthInput = useMemo(
    () => ({ servers: mcpHook.servers, discoveredTools: mcpHook.discoveredTools }),
    [mcpHook.servers, mcpHook.discoveredTools]
  );
  const agentHooks = useAgentEditorHooks({
    initialConfig: loadResult.agentConfig,
  });

  const isAgentMode = loadResult.agentConfig !== undefined;
  const canPublish = isAgentMode
    ? !hasMcpErrors(mcpHealthInput)
    : serializedGraph !== null && !hasMcpErrors(mcpHealthInput);

  useInitialViewport(reactFlowWrapper, rf.setViewport, loadResult.graphData);
  useSearchKeyboard(setSearchOpen);

  const initialLayoutDone = useRef(false);
  useEffect(() => {
    if (initialLayoutDone.current) return;
    initialLayoutDone.current = true;
    handleFormat({ skipPersist: true });
  }, [handleFormat]);

  const prevNodeCount = useRef(nodes.length);
  const prevEdgeCount = useRef(edges.length);
  useEffect(() => {
    const nodesChanged = nodes.length !== prevNodeCount.current;
    const edgesChanged = edges.length !== prevEdgeCount.current;
    if (nodesChanged || edgesChanged) {
      prevNodeCount.current = nodes.length;
      prevEdgeCount.current = edges.length;
      handleFormat();
    }
  }, [nodes.length, edges.length, handleFormat]);

  const handleSimSelectNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
      selection.setSelectedNodeId(nodeId);
    },
    [setNodes, selection]
  );

  const simulation = useSimulation({
    allNodes: nodes,
    edges,
    agents,
    preset: presetsHook.activePreset,
    apiKeyId: apiKeys.stagingKeyId ?? '',
    mcpServers: mcpHook.servers,
    outputSchemas: outputSchemasHook.schemas,
    onZoomToNode: zoomView.handleZoomToNode,
    onSelectNode: handleSimSelectNode,
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
    deleteConfirmation,
    setNodes,
    setEdges,
    displayNodes,
    selection,
    zoomView,
    graphActions,
    handleImport,
    handleExport,
    handleFormat,
    getGraphData,
    pendingSave,
    canPublish,
    mcpHealthInput,
    simulation,
    presetsHook,
    mcpHook,
    outputSchemasHook,
    ctxPreconditions,
    globalPanelOpen,
    setGlobalPanelOpen,
    presetsOpen,
    setPresetsOpen,
    toolsOpen,
    setToolsOpen,
    searchOpen,
    setSearchOpen,
    libraryOpen,
    setLibraryOpen,
    envVariables,
    mcpLibrary,
    version,
    setVersion,
    apiKeys,
    pushOperation: opQueue.pushOperation,
    flush: opQueue.flush,
    hasPendingOps: opQueue.hasPendingOps,
    clearQueue: opQueue.clearQueue,
    agentHooks,
    agentConfig: agentHooks.agentConfig,
  };
}

function LoadedEditor(props: LoadedEditorProps) {
  const h = useGraphBuilderHooks(props);
  const versionsHook = useVersions(props.agentId, props.initialVersion ?? DEFAULT_VERSION);
  const router = useRouter();

  const handleContextValue = {
    onSourceHandleClick: h.graphActions.onSourceHandleClick,
    onZoomToNode: h.zoomView.handleZoomToNode,
  };

  const isReadOnly = props.readOnly === true;

  return (
    <HandleContext.Provider value={handleContextValue}>
      <div className="relative flex h-full w-full flex-col items-center ml-0">
        {!isReadOnly && !h.simulation.active && <Toolbar
          onAddNode={h.graphActions.handleAddNode}
          onImport={h.handleImport}
          onExport={h.handleExport}
          onFormat={h.handleFormat}
          onPlay={h.simulation.start}
          simulationActive={h.simulation.active}
          statusSlot={<StatusButton nodes={h.nodes} edges={h.edges} pendingSave={h.pendingSave} mcpHealth={h.mcpHealthInput} />}
          globalPanelOpen={h.globalPanelOpen}
          onToggleGlobalPanel={() => h.setGlobalPanelOpen((prev) => !prev)}
          onTogglePresets={() => h.setPresetsOpen((prev) => !prev)}
          onToggleTools={() => h.setToolsOpen((prev) => !prev)}
          onToggleLibrary={() => h.setLibraryOpen((prev) => !prev)}
          stagingKeyId={h.apiKeys.stagingKeyId}
          orgSlug={props.orgSlug}
          orgName={props.orgName}
          orgAvatarUrl={props.orgAvatarUrl}
          agentName={props.agentName}
          publishSlot={
            props.agentId !== undefined ? (
              <PublishButton
                agentId={props.agentId}
                agentSlug={props.agentSlug ?? ''}
                version={h.version}
                canPublish={h.canPublish}
                hasApiKey={h.apiKeys.productionKeyId !== null}
                flush={h.flush}
                onPublished={(newVersion) => {
                  h.setVersion(newVersion);
                  versionsHook.setCurrentVersion(newVersion);
                  h.apiKeys.setProductionKeyId(h.apiKeys.stagingKeyId);
                  void versionsHook.refresh();
                  router.refresh();
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
        />}

        {h.agentConfig !== undefined ? (
          <AgentEditorWrapper
            agentConfig={h.agentConfig}
            pushOperation={h.pushOperation}
            importCounter={h.agentHooks.importCounter}
          />
        ) : (
          <GraphCanvas
            agentId={props.agentId ?? ''}
            reactFlowWrapper={h.reactFlowWrapper}
            displayNodes={h.displayNodes}
            edges={h.edges}
            onNodesChange={isReadOnly ? () => {} : h.onNodesChange}
            onEdgesChange={isReadOnly ? () => {} : h.onEdgesChange}
            onConnect={isReadOnly ? () => {} : h.graphActions.onConnect}
            onNodeClick={h.selection.onNodeClick}
            onEdgeClick={h.selection.onEdgeClick}
            onPaneClick={h.selection.onPaneClick}
            zoomViewNodeId={h.zoomView.zoomViewNodeId}
            simulation={h.simulation}
            onExitZoomView={h.zoomView.handleExitZoomView}
            readOnly={isReadOnly}
          />
        )}

        {h.agentConfig === undefined && (
          <SearchDialog
            nodes={h.nodes.map((n) => ({ id: n.id, text: (n.data as RFNodeData).text }))}
            open={h.searchOpen}
            onClose={() => h.setSearchOpen(false)}
            onSelectNode={h.selection.handleSearchSelectNode}
          />
        )}

        <SidePanels
          readOnly={isReadOnly}
          selection={h.selection}
          simulation={h.simulation}
          nodes={h.nodes}
          edges={h.edges}
          agents={h.agents}
          presetsHook={h.presetsHook}
          mcpHook={h.mcpHook}
          outputSchemasHook={h.outputSchemasHook}
          globalPanelOpen={h.globalPanelOpen}
          presetsOpen={h.presetsOpen}
          toolsOpen={h.toolsOpen}
          libraryOpen={h.libraryOpen}
          mcpLibrary={h.mcpLibrary}
          setNodes={h.setNodes}
          setEdges={h.setEdges}
          ctxPreconditions={h.ctxPreconditions}
          orgApiKeys={props.orgApiKeys ?? []}
          orgId={props.orgId ?? ''}
          agentId={props.agentId ?? ''}
          agentName={props.agentName ?? ''}
          orgSlug={props.orgSlug ?? ''}
          envVariables={h.envVariables}
          stagingKeyId={h.apiKeys.stagingKeyId}
          productionKeyId={h.apiKeys.productionKeyId}
          onStagingKeyChange={h.apiKeys.handleStagingKeyChange}
          onProductionKeyChange={h.apiKeys.handleProductionKeyChange}
          onPublishMcpServer={() => {}}
          onOpenMcpLibrary={() => {
            h.setLibraryOpen(true);
            h.setPresetsOpen(false);
          }}
          onCloseLibrary={() => h.setLibraryOpen(false)}
          pushOperation={h.pushOperation}
        />

        {!isReadOnly && h.agentConfig === undefined && (
          <DeleteConfirmDialog
            pendingDelete={h.deleteConfirmation.pendingDelete}
            onConfirm={h.deleteConfirmation.confirmDelete}
            onCancel={h.deleteConfirmation.cancelDelete}
          />
        )}

        {!isReadOnly && h.agentConfig === undefined && h.graphActions.connectionMenu !== null && (
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
  if (props.graphOverride !== undefined) {
    return (
      <GraphBuilderWithOverride {...props} graph={props.graphOverride} />
    );
  }

  return <GraphBuilderWithLoader {...props} />;
}

function GraphBuilderWithOverride(props: GraphBuilderProps & { graph: Graph }) {
  const loadResult: GraphLoadResult = useMemo(
    () => buildLoadResultFromGraph(props.graph),
    [props.graph]
  );
  const noop = useCallback(() => {}, []);

  return (
    <LoadedEditor
      {...props}
      loadResult={loadResult}
      reload={noop}
      initialDiscoveredTools={{}}
    />
  );
}

function GraphBuilderWithLoader(props: GraphBuilderProps) {
  const loader = useGraphLoader(props.agentId);
  const mcpServers = loader.loading ? undefined : loader.result.mcpServers;
  const discovery = useMcpDiscovery(mcpServers, undefined, props.orgId);

  if (loader.loading) return <GraphBuilderLoading />;
  if (discovery.loading) return <GraphBuilderLoading serverProgress={discovery.serverProgress} />;

  return (
    <LoadedEditor
      {...props}
      loadResult={loader.result}
      reload={loader.reload}
      initialDiscoveredTools={discovery.discoveredTools}
    />
  );
}

export function GraphBuilder(props: GraphBuilderProps) {
  return (
    <ReactFlowProvider>
      <GraphBuilderInner {...props} />
    </ReactFlowProvider>
  );
}
