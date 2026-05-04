'use client';

import type { SelectedTool } from '@daviddh/llm-graph-runner';
import { ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useAgentEditorHooks } from '../hooks/useAgentEditorHooks';
import { useAgentExport } from '../hooks/useAgentExport';
import { useAgentImport } from '../hooks/useAgentImport';
import { useApiKeySelection } from '../hooks/useApiKeySelection';
import { useAutoSave } from '../hooks/useAutoSave';
import { useDeleteConfirmation } from '../hooks/useDeleteConfirmation';
import { useEnvVariables } from '../hooks/useEnvVariables';
import { useExportGraph } from '../hooks/useExportGraph';
import { useFormatGraph } from '../hooks/useFormatGraph';
import { useGraphActions } from '../hooks/useGraphActions';
import {
  useContextPreconditions,
  useInitialViewport,
  useSearchKeyboard,
} from '../hooks/useGraphBuilderHelpers';
import type { GraphLoadResult } from '../hooks/useGraphLoader';
import { useGraphLoader } from '../hooks/useGraphLoader';
import { useGraphSelection } from '../hooks/useGraphSelection';
import { useImportGraph } from '../hooks/useImportGraph';
import { useMcpDiscovery } from '../hooks/useMcpDiscovery';
import { useMcpLibrary } from '../hooks/useMcpLibrary';
import { useMcpServers } from '../hooks/useMcpServers';
import { useOperationQueue } from '../hooks/useOperationQueue';
import { useOutputSchemas } from '../hooks/useOutputSchemas';
import { usePresets } from '../hooks/usePresets';
import { useSeedInitialGraph } from '../hooks/useSeedInitialGraph';
import { useSimulation } from '../hooks/useSimulation';
import {
  useCreateIfElse,
  useCreateLoop,
  useCreateToolNode,
  useCreateUserNode,
} from '../hooks/useStructuredNodeCreation';
import { useVersions } from '../hooks/useVersions';
import { useZoomView } from '../hooks/useZoomView';
import type { DiscoveredTool } from '../lib/api';
import type { ApiKeyRow } from '../lib/apiKeys';
import type { Agent, Graph } from '../schemas/graph.schema';
import { getSourceEdgeType } from '../utils/edgeTypeUtils';
import { buildInitialEdges, buildInitialNodes } from '../utils/graphInitializer';
import { serializeGraphData } from '../utils/graphSerializer';
import type { RFNodeData } from '../utils/graphTransformers';
import { AgentEditorWrapper } from './AgentEditorWrapper';
import { GraphBuilderLoading } from './GraphBuilderLoading';
import { GraphCanvas } from './GraphCanvas';
import { SidePanels } from './SidePanels';
import { ToolRegistryProvider } from './ToolRegistryProvider';
import { useCopilotContext } from './copilot/CopilotProvider';
import { useEditorCache } from './editors/EditorCacheProvider';
import { HandleContext } from './nodes/HandleContext';
import { ConnectionMenu } from './panels/ConnectionMenu';
import { DataTabContent } from './panels/DataTabContent';
import { DeleteConfirmDialog } from './panels/DeleteConfirmDialog';
import { PublishButton } from './panels/PublishButton';
import type { PublishTenant } from './panels/PublishButtonTenantPicker';
import { SearchDialog } from './panels/SearchDialog';
import { SettingsTabContent } from './panels/SettingsTabContent';
import { StatusButton, hasMcpErrors } from './panels/StatusButton';
import { Toolbar } from './panels/Toolbar';
import { VersionSwitcherSlot } from './panels/VersionSwitcherSlot';
import { SimulationPanel } from './panels/simulation';
import { createPrecondition, handlePreconditionRemove, handlePreconditionUpdate } from './sidePanelHelpers';
import { useSchemaDialogState } from './useSidePanelState';

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
  tenants?: PublishTenant[];
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
  agentAppType?: string;
  agentSelectedTools?: SelectedTool[];
  agentUpdatedAt?: string;
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
    agentId,
  });

  const apiKeys = useApiKeySelection({
    agentId,
    initialStagingKeyId: props.stagingApiKeyId ?? null,
    initialProductionKeyId: props.productionApiKeyId ?? null,
  });

  const [globalPanelOpen, setGlobalPanelOpen] = useState(false);
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
      setToolsOpen,
      setSearchOpen,
      setLibraryOpen,
      setCopilotOpen,
    }),
    [setCopilotOpen]
  );

  const selection = useGraphSelection({ nodes, setNodes, setEdges, reactFlow: rf, reactFlowWrapper }, panels);

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
    wrapperRef: reactFlowWrapper,
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

  const structuredCreationParams = useMemo(
    () => ({
      nodes,
      setNodes,
      setEdges,
      setSelectedNodeId: selection.setSelectedNodeId,
      pushOperation: opQueue.pushOperation,
      menu: graphActions.connectionMenu,
      closeMenu: graphActions.handleConnectionMenuClose,
    }),
    [
      nodes,
      setNodes,
      setEdges,
      selection.setSelectedNodeId,
      opQueue.pushOperation,
      graphActions.connectionMenu,
      graphActions.handleConnectionMenuClose,
    ]
  );

  const createUserNode = useCreateUserNode(structuredCreationParams);
  const createToolNode = useCreateToolNode(structuredCreationParams);
  const createIfElse = useCreateIfElse(structuredCreationParams);
  const createLoop = useCreateLoop(structuredCreationParams);

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
    () =>
      serializeGraphData({
        nodes,
        edges,
        agents,
        mcpServers: mcpHook.servers,
        outputSchemas: outputSchemasHook.schemas,
      }),
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

  const agentExport = useAgentExport({
    agentConfig: agentHooks.agentConfig,
    mcpServers: mcpHook.servers,
  });

  const agentImport = useAgentImport({
    pushOperation: opQueue.pushOperation,
    setAgentConfig: agentHooks.setAgentConfig,
    getCurrentContextItems: agentHooks.getCurrentContextItems,
  });

  const isAgentMode = loadResult.agentConfig !== undefined;
  const effectiveImport = isAgentMode ? agentImport : handleImport;
  const effectiveExport = isAgentMode ? agentExport : handleExport;

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
  const prevZoomNodeId = useRef(zoomView.zoomViewNodeId);
  useEffect(() => {
    const nodesChanged = nodes.length !== prevNodeCount.current;
    const edgesChanged = edges.length !== prevEdgeCount.current;
    const zoomChanged = zoomView.zoomViewNodeId !== prevZoomNodeId.current;
    prevZoomNodeId.current = zoomView.zoomViewNodeId;
    if (nodesChanged || edgesChanged) {
      prevNodeCount.current = nodes.length;
      prevEdgeCount.current = edges.length;
      if (!zoomChanged) handleFormat();
    }
  }, [nodes.length, edges.length, zoomView.zoomViewNodeId, handleFormat]);

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
    appType: loadResult.agentConfig !== undefined ? 'agent' : 'workflow',
    agentConfig: agentHooks.agentConfig,
    orgId: props.orgId,
  });

  const ctxPreconditions = useContextPreconditions(edges);

  const schemaDialog = useSchemaDialogState({
    outputSchemasHook,
    selection,
    setNodes,
  });

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
    handleImport: effectiveImport,
    handleExport: effectiveExport,
    handleFormat,
    getGraphData,
    pendingSave,
    canPublish,
    mcpHealthInput,
    simulation,
    presetsHook,
    mcpHook,
    outputSchemasHook,
    schemaDialog,
    ctxPreconditions,
    globalPanelOpen,
    setGlobalPanelOpen,
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
    createUserNode,
    createToolNode,
    createIfElse,
    createLoop,
  };
}

function useAutoStartAgentSimulation(isAgent: boolean, active: boolean, start: () => void) {
  useEffect(() => {
    if (isAgent && !active) start();
  }, [isAgent, active, start]);
}

type GraphBuilderHooksResult = ReturnType<typeof useGraphBuilderHooks>;

function buildSettingsTabContent(h: GraphBuilderHooksResult, orgApiKeys: ApiKeyRow[], isAgentMode: boolean) {
  return (
    <SettingsTabContent
      orgApiKeys={orgApiKeys}
      stagingKeyId={h.apiKeys.stagingKeyId}
      productionKeyId={h.apiKeys.productionKeyId}
      onStagingKeyChange={h.apiKeys.handleStagingKeyChange}
      onProductionKeyChange={h.apiKeys.handleProductionKeyChange}
      showWorkflowSections={!isAgentMode}
      contextKeys={h.presetsHook.contextKeys}
      context={{
        keys: h.presetsHook.contextKeys,
        onAdd: h.presetsHook.addContextKey,
        onRemove: h.presetsHook.removeContextKey,
        onRename: h.presetsHook.renameContextKey,
      }}
      contextPreconditions={{
        preconditions: h.ctxPreconditions.customContextPreconditions,
        onAdd: () => createPrecondition(h.ctxPreconditions),
        onRemove: (id) => handlePreconditionRemove(id, h.ctxPreconditions, h.setEdges),
        onUpdate: (id, updates) => handlePreconditionUpdate(id, updates, h.ctxPreconditions, h.setEdges),
      }}
      testingPresets={{
        presets: h.presetsHook.presets,
        onAdd: h.presetsHook.addPreset,
        onDelete: h.presetsHook.deletePreset,
        onUpdate: h.presetsHook.updatePreset,
      }}
    />
  );
}

function buildDataTabContent(
  h: GraphBuilderHooksResult,
  agentId: string,
  orgSlug: string | undefined,
  agentSlug: string | undefined
) {
  const editFormHref =
    orgSlug !== undefined && agentSlug !== undefined
      ? (formId: string): string => `/orgs/${orgSlug}/editor/${agentSlug}?dataTab=forms&form=${formId}`
      : undefined;

  return (
    <DataTabContent
      agentId={agentId}
      schemas={h.outputSchemasHook.schemas}
      onAdd={() => {
        const id = h.outputSchemasHook.addSchema();
        h.schemaDialog.handleEditNewSchema(id);
      }}
      onRemove={h.schemaDialog.handleRemoveSchema}
      onEdit={h.schemaDialog.handleEditSchema}
      editFormHref={editFormHref}
    />
  );
}

function buildEmbeddedSimulationPanel(simulation: ReturnType<typeof useGraphBuilderHooks>['simulation']) {
  return (
    <SimulationPanel
      embedded
      lastUserText={simulation.lastUserText}
      nodeResults={simulation.nodeResults}
      conversationEntries={simulation.conversationEntries}
      visitedNodes={simulation.visitedNodes}
      terminated={simulation.terminated}
      loading={simulation.loading}
      currentNode={simulation.currentNode}
      totalTokens={simulation.totalTokens}
      turnCount={simulation.turnCount}
      isAgent={simulation.isAgent}
      modelId={simulation.modelId}
      onModelIdChange={simulation.setModelId}
      onSendMessage={simulation.sendMessage}
      onStop={simulation.stop}
      onClear={simulation.clear}
    />
  );
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
  const isAgentMode = h.agentConfig !== undefined;

  const { panelInsets, toolbarPortal, settingsPortal, dataPortal, activeEditorId } = useEditorCache();

  const insetStyle = panelInsets
    ? {
        top: panelInsets.top,
        left: panelInsets.left,
        right: panelInsets.right,
        bottom: panelInsets.bottom,
      }
    : { top: 0, left: 0, right: 0, bottom: 0 };

  useAutoStartAgentSimulation(isAgentMode, h.simulation.active, h.simulation.start);

  const isActiveEditor = props.agentId !== undefined && props.agentId === activeEditorId;
  const showToolbar =
    !isReadOnly && toolbarPortal !== null && isActiveEditor && (isAgentMode || !h.simulation.active);

  return (
    <HandleContext.Provider value={handleContextValue}>
      <ToolRegistryProvider agentId={props.agentId ?? ''}>
        <div className="relative h-full w-full">
          {/* Canvas layer — fills entire main area */}
          {h.agentConfig !== undefined ? (
            <div className="absolute inset-0 overflow-hidden">
              <AgentEditorWrapper
                agentConfig={h.agentConfig}
                pushOperation={h.pushOperation}
                importCounter={h.agentHooks.importCounter}
                onBackgroundClick={h.selection.onPaneClick}
                onConfigChange={h.agentHooks.setAgentConfigSilent}
                agentId={props.agentId}
                orgId={props.orgId}
                insets={insetStyle}
                rightSlot={buildEmbeddedSimulationPanel(h.simulation)}
              />
            </div>
          ) : (
            <div className="absolute top-[0px] bottom-2.5 right-3.5 -left-0.5 rounded-xl overflow-hidden">
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
            </div>
          )}

          {/* Toolbar — portaled into the main header */}
          {showToolbar &&
            toolbarPortal &&
            createPortal(
              <Toolbar
                onAddNode={h.graphActions.handleAddNode}
                onImport={h.handleImport}
                onExport={h.handleExport}
                onFormat={h.handleFormat}
                hideWorkflowActions={h.agentConfig !== undefined}
                onPlay={h.simulation.start}
                simulationActive={h.simulation.active}
                statusSlot={
                  <StatusButton
                    nodes={h.nodes}
                    edges={h.edges}
                    pendingSave={h.pendingSave}
                    mcpHealth={h.mcpHealthInput}
                    skipGraphValidation={h.agentConfig !== undefined}
                  />
                }
                globalPanelOpen={h.globalPanelOpen}
                onToggleGlobalPanel={() => h.setGlobalPanelOpen((prev) => !prev)}
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
                      orgSlug={props.orgSlug ?? ''}
                      tenants={props.tenants ?? []}
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
              />,
              toolbarPortal
            )}

          {/* Settings / Data tab portals — rendered into EditorTabs tab content */}
          {!isReadOnly &&
            isActiveEditor &&
            settingsPortal !== null &&
            createPortal(buildSettingsTabContent(h, props.orgApiKeys ?? [], isAgentMode), settingsPortal)}
          {!isReadOnly &&
            isActiveEditor &&
            dataPortal !== null &&
            createPortal(
              buildDataTabContent(h, props.agentId ?? '', props.orgSlug, props.agentSlug),
              dataPortal
            )}

          {/* Panels layer — positioned within the slot area */}
          <div className="absolute z-10 pointer-events-none" style={insetStyle}>
            <div className="relative flex h-full w-full flex-col items-center">
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
                schemaDialog={h.schemaDialog}
                globalPanelOpen={h.globalPanelOpen}
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
                }}
                onCloseLibrary={() => h.setLibraryOpen(false)}
                pushOperation={h.pushOperation}
                agentToolsConfig={
                  props.agentId !== undefined &&
                  props.agentSelectedTools !== undefined &&
                  props.agentUpdatedAt !== undefined
                    ? {
                        agentId: props.agentId,
                        appType: props.agentAppType ?? '',
                        initialSelectedTools: props.agentSelectedTools,
                        initialUpdatedAt: props.agentUpdatedAt,
                      }
                    : undefined
                }
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
                  sourceEdgeType={getSourceEdgeType(h.graphActions.connectionMenu.sourceNodeId, h.edges)}
                  nodes={h.nodes.map((n) => ({ id: n.id, text: (n.data as RFNodeData).text }))}
                  onSelectNode={h.graphActions.handleConnectionMenuSelectNode}
                  onCreateNode={h.graphActions.handleConnectionMenuCreateNode}
                  onCreateUserNode={h.createUserNode}
                  onCreateToolNode={h.createToolNode}
                  onCreateIfElse={h.createIfElse}
                  onCreateLoop={h.createLoop}
                  onClose={h.graphActions.handleConnectionMenuClose}
                />
              )}
            </div>
          </div>
        </div>
      </ToolRegistryProvider>
    </HandleContext.Provider>
  );
}

function GraphBuilderInner(props: GraphBuilderProps) {
  if (props.graphOverride !== undefined) {
    return <GraphBuilderWithOverride {...props} graph={props.graphOverride} />;
  }

  return <GraphBuilderWithLoader {...props} />;
}

function GraphBuilderWithOverride(props: GraphBuilderProps & { graph: Graph }) {
  const loadResult: GraphLoadResult = useMemo(() => buildLoadResultFromGraph(props.graph), [props.graph]);
  const noop = useCallback(() => {}, []);

  return <LoadedEditor {...props} loadResult={loadResult} reload={noop} initialDiscoveredTools={{}} />;
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
