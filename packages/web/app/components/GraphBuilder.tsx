"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nanoid } from "nanoid";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { layoutGraph } from "../utils/layoutGraph";

import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges";
import { HandleContext } from "./nodes/HandleContext";
import { Toolbar } from "./panels/Toolbar";
import { StatusButton } from "./panels/StatusButton";
import { NodePanel } from "./panels/NodePanel";
import { EdgePanel } from "./panels/EdgePanel";
import { GlobalNodesPanel } from "./panels/GlobalNodesPanel";
import { ConnectionMenu } from "./panels/ConnectionMenu";
import { PresetsPanel } from "./panels/PresetsPanel";
import { SearchDialog } from "./panels/SearchDialog";
import { SimulationPanel } from "./panels/simulation";
import { GraphSchema, type Agent } from "../schemas/graph.schema";
import { usePresets } from "../hooks/usePresets";
import { useSimulation } from "../hooks/useSimulation";
import {
  GRAPH_DATA,
  processGraph,
  findInitialNodePosition,
  calculateInitialViewport,
} from "../utils/loadGraphData";
import {
  schemaNodeToRFNode,
  schemaEdgeToRFEdge,
  rfEdgeToSchemaEdge,
  type RFNodeData,
  type RFEdgeData,
} from "../utils/graphTransformers";

const START_NODE_ID = "INITIAL_STEP";
const DEFAULT_FIRST_NODE_ID = "first_node";
const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 220;
const START_NODE_WIDTH = 100;
const START_NODE_HEIGHT = 44;
const NODE_GAP = 100;

// Default start node for blank canvas
const defaultStartNode: Node<RFNodeData> = {
  id: START_NODE_ID,
  type: "start",
  position: { x: -50, y: 200 },
  selectable: false,
  draggable: false,
  data: {
    nodeId: START_NODE_ID,
    text: "",
    description: "",
  },
};

// Default first node connected to start
const defaultFirstNode: Node<RFNodeData> = {
  id: DEFAULT_FIRST_NODE_ID,
  type: "agent",
  position: {
    x: defaultStartNode.position.x + START_NODE_WIDTH + NODE_GAP,
    y:
      defaultStartNode.position.y +
      START_NODE_HEIGHT / 2 -
      DEFAULT_NODE_HEIGHT / 2,
  },
  data: {
    nodeId: DEFAULT_FIRST_NODE_ID,
    text: "New node",
    description: "Node description",
    nodeWidth: DEFAULT_NODE_WIDTH,
  },
};

// Default edge from start to first node with user_said "hello"
const defaultStartEdge: Edge<RFEdgeData> = {
  id: `${START_NODE_ID}-${DEFAULT_FIRST_NODE_ID}`,
  source: START_NODE_ID,
  target: DEFAULT_FIRST_NODE_ID,
  sourceHandle: "right-source",
  targetHandle: "left-target",
  type: "precondition",
  data: {
    preconditions: [
      {
        type: "user_said",
        value: "Hello",
        description: "User greeting",
      },
    ],
  },
};

// Initialize nodes and edges from graph data
function createInitialNodes(): Node<RFNodeData>[] {
  if (!GRAPH_DATA) return [defaultStartNode, defaultFirstNode];
  const { graph, nodeWidth } = GRAPH_DATA;
  return graph.nodes.map((n, i) => {
    const baseNode = schemaNodeToRFNode(n, i);
    const isStartNode = n.id === START_NODE_ID;
    return {
      ...baseNode,
      type: isStartNode ? "start" : baseNode.type,
      selectable: !isStartNode,
      draggable: false,
      data: {
        ...baseNode.data,
        nodeWidth,
      },
    };
  });
}

function createInitialEdges(): Edge<RFEdgeData>[] {
  if (!GRAPH_DATA) return [defaultStartEdge];
  const { graph } = GRAPH_DATA;
  return graph.edges.map((e, i) => schemaEdgeToRFEdge(e, i, graph.nodes));
}

const initialNodes = createInitialNodes();
const initialEdges = createInitialEdges();

function GraphBuilderInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const {
    screenToFlowPosition,
    fitView,
    setViewport,
    getViewport,
  } = useReactFlow();

  // React Flow as source of truth
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Local UI state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [agents] = useState<Agent[]>(GRAPH_DATA?.graph.agents ?? []);

  // Connection menu state
  const [connectionMenu, setConnectionMenu] = useState<{
    position: { x: number; y: number };
    sourceNodeId: string;
    sourceHandleId: string | null;
  } | null>(null);

  // Global nodes panel state
  const [globalPanelOpen, setGlobalPanelOpen] = useState(false);
  const [customContextPreconditions, setCustomContextPreconditions] = useState<string[]>([]);

  // Presets state
  const presetsHook = usePresets();
  const [presetsOpen, setPresetsOpen] = useState(false);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);

  // Zoom view state
  const [zoomViewNodeId, setZoomViewNodeId] = useState<string | null>(null);
  const [savedGraphState, setSavedGraphState] = useState<{
    nodes: Node<RFNodeData>[];
    edges: Edge<RFEdgeData>[];
    viewport: { x: number; y: number; zoom: number };
  } | null>(null);

  // Set initial viewport to center start node vertically
  useEffect(() => {
    if (!reactFlowWrapper.current) return;

    const initialPos = GRAPH_DATA
      ? findInitialNodePosition(GRAPH_DATA.graph)
      : defaultStartNode.position;

    if (initialPos) {
      const containerHeight = reactFlowWrapper.current.clientHeight;
      const viewport = calculateInitialViewport(initialPos, containerHeight);
      setViewport(viewport);
    }
  }, [setViewport]);

  // Cmd+F / Ctrl+F to toggle search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSearchSelectNode = useCallback(
    (targetNodeId: string) => {
      const node = nodes.find((n) => n.id === targetNodeId);
      if (node && reactFlowWrapper.current) {
        const nodeData = node.data as RFNodeData;
        const nodeWidth = nodeData.nodeWidth ?? DEFAULT_NODE_WIDTH;
        const nodeHeight =
          node.type === "start" ? START_NODE_HEIGHT : DEFAULT_NODE_HEIGHT;
        const { zoom } = getViewport();
        const { width, height } =
          reactFlowWrapper.current.getBoundingClientRect();

        setViewport(
          {
            x: width / 2 - (node.position.x + nodeWidth / 2) * zoom,
            y: height / 2 - (node.position.y + nodeHeight / 2) * zoom,
            zoom,
          },
          { duration: 300 },
        );
      }
      setNodes((nds) =>
        nds.map((n) => ({ ...n, selected: n.id === targetNodeId })),
      );
      setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
      setSelectedNodeId(targetNodeId);
      setSelectedEdgeId(null);
      setGlobalPanelOpen(false);
      setPresetsOpen(false);
    },
    [nodes, getViewport, setViewport, setNodes, setEdges],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      // Prevent connecting to the start node
      if (params.target === START_NODE_ID) return;
      setEdges((eds) => addEdge({ ...params, type: "precondition" }, eds));
      setConnectionMenu(null);
    },
    [setEdges],
  );

  // Handle click on source handle to show connection menu
  const onSourceHandleClick = useCallback(
    (nodeId: string, handleId: string, event: React.MouseEvent) => {
      // Start node can only have 1 connection
      if (nodeId === START_NODE_ID) {
        const hasConnection = edges.some((e) => e.source === START_NODE_ID);
        if (hasConnection) {
          return; // Don't allow more connections from start
        }
      }

      const rect = (event.target as HTMLElement).getBoundingClientRect();
      setConnectionMenu({
        position: { x: rect.right + 10, y: rect.top },
        sourceNodeId: nodeId,
        sourceHandleId: handleId,
      });
    },
    [edges],
  );

  const handleConnectionMenuSelectNode = useCallback(
    (targetNodeId: string) => {
      if (!connectionMenu) return;

      setEdges((eds) =>
        addEdge(
          {
            source: connectionMenu.sourceNodeId,
            target: targetNodeId,
            sourceHandle: connectionMenu.sourceHandleId,
            targetHandle: "left-target",
            type: "precondition",
          },
          eds,
        ),
      );
      setConnectionMenu(null);
    },
    [connectionMenu, setEdges],
  );

  const handleConnectionMenuCreateNode = useCallback(() => {
    if (!connectionMenu) return;

    const id = `node_${nanoid(8)}`;
    const NODE_WIDTH = GRAPH_DATA?.nodeWidth ?? 180;
    const NODE_HEIGHT = 220;

    // Find the source node to position relative to it
    const sourceNode = nodes.find((n) => n.id === connectionMenu.sourceNodeId);
    const isStartNode = sourceNode?.type === "start";
    const sourceNodeWidth = isStartNode
      ? START_NODE_WIDTH
      : ((sourceNode?.data as RFNodeData)?.nodeWidth ?? NODE_WIDTH);
    const sourceNodeHeight = isStartNode ? START_NODE_HEIGHT : NODE_HEIGHT;

    // Position new node based on which handle was clicked
    let newPosition: { x: number; y: number };

    if (!sourceNode) {
      const flowPos = screenToFlowPosition(connectionMenu.position);
      newPosition = { x: flowPos.x, y: flowPos.y };
    } else if (connectionMenu.sourceHandleId === "top-source") {
      // NODE_GAP above, horizontally centered
      newPosition = {
        x: sourceNode.position.x + sourceNodeWidth / 2 - NODE_WIDTH / 2,
        y: sourceNode.position.y - NODE_HEIGHT - NODE_GAP,
      };
    } else if (connectionMenu.sourceHandleId === "bottom-source") {
      // NODE_GAP below, horizontally centered
      newPosition = {
        x: sourceNode.position.x + sourceNodeWidth / 2 - NODE_WIDTH / 2,
        y: sourceNode.position.y + sourceNodeHeight + NODE_GAP,
      };
    } else {
      // right-source (default): NODE_GAP to the right, vertically centered
      newPosition = {
        x: sourceNode.position.x + sourceNodeWidth + NODE_GAP,
        y: sourceNode.position.y + sourceNodeHeight / 2 - NODE_HEIGHT / 2,
      };
    }

    // Determine target handle based on source handle
    let targetHandle: string;
    if (connectionMenu.sourceHandleId === "top-source") {
      targetHandle = "bottom-target";
    } else if (connectionMenu.sourceHandleId === "bottom-source") {
      targetHandle = "top-target";
    } else {
      targetHandle = "left-target";
    }

    const newNode: Node<RFNodeData> = {
      id,
      type: "agent",
      position: newPosition,
      data: {
        nodeId: id,
        text: "New node",
        description: "Node description",
        nodeWidth: NODE_WIDTH,
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) =>
      addEdge(
        {
          source: connectionMenu.sourceNodeId,
          target: id,
          sourceHandle: connectionMenu.sourceHandleId,
          targetHandle,
          type: "precondition",
        },
        eds,
      ),
    );
    setConnectionMenu(null);
    setSelectedNodeId(id);
  }, [connectionMenu, nodes, screenToFlowPosition, setNodes, setEdges]);

  const handleConnectionMenuClose = useCallback(() => {
    setConnectionMenu(null);
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    // Don't select the start node
    if (node.id === START_NODE_ID) return;
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setGlobalPanelOpen(false);
    setPresetsOpen(false);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnectionMenu(null);
    setGlobalPanelOpen(false);
    setPresetsOpen(false);
  }, []);

  const handleAddNode = useCallback(() => {
    const id = `node_${nanoid(8)}`;
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const screenCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height * 0.3,
    };
    const position = screenToFlowPosition(screenCenter);
    const NODE_WIDTH = 180;
    const NODE_HEIGHT = 60;
    const centeredPosition = {
      x: position.x - NODE_WIDTH / 2,
      y: position.y - NODE_HEIGHT / 2,
    };

    const newNode: Node<RFNodeData> = {
      id,
      type: "agent",
      position: centeredPosition,
      data: {
        nodeId: id,
        text: "New node",
        description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
        nodeWidth: GRAPH_DATA?.nodeWidth ?? 180,
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
  }, [screenToFlowPosition, setNodes]);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const result = GraphSchema.safeParse(json);
        if (result.success) {
          // Process graph with layout (same as hardcoded load)
          const { graph, nodeWidth } = processGraph(result.data);

          const newNodes = graph.nodes.map((n, i) => {
            const baseNode = schemaNodeToRFNode(n, i);
            const isStartNode = n.id === START_NODE_ID;
            return {
              ...baseNode,
              type: isStartNode ? "start" : baseNode.type,
              selectable: !isStartNode,
              draggable: false,
              data: {
                ...baseNode.data,
                nodeWidth,
              },
            };
          });
          const newEdges = graph.edges.map((e, i) =>
            schemaEdgeToRFEdge(e, i, graph.nodes),
          );
          setNodes(newNodes);
          setEdges(newEdges);

          // Set viewport to center INITIAL_STEP
          setTimeout(() => {
            if (!reactFlowWrapper.current) return;
            const initialPos = findInitialNodePosition(graph);
            if (initialPos) {
              const containerHeight = reactFlowWrapper.current.clientHeight;
              const viewport = calculateInitialViewport(
                initialPos,
                containerHeight,
              );
              setViewport(viewport);
            }
          }, 50);
        } else {
          alert("Invalid graph file: " + result.error.message);
        }
      } catch {
        alert("Failed to parse JSON file");
      }
    };
    input.click();
  }, [setNodes, setEdges, setViewport]);

  const handleExport = useCallback(() => {
    const graph = {
      startNode: START_NODE_ID,
      agents,
      nodes: nodes.map((n) => ({
        id: n.id,
        text: (n.data as RFNodeData).text,
        // Start node exports as "agent" kind for schema compatibility
        kind: (n.type === "start" ? "agent" : n.type) as
          | "agent"
          | "agent_decision",
        description: (n.data as RFNodeData).description,
        agent: (n.data as RFNodeData).agent,
        nextNodeIsUser: (n.data as RFNodeData).nextNodeIsUser,
        global: (n.data as RFNodeData).global,
        defaultFallback: (n.data as RFNodeData).defaultFallback,
        position: n.position,
      })),
      edges: edges.map((e) => rfEdgeToSchemaEdge(e)),
    };

    const result = GraphSchema.safeParse(graph);
    if (!result.success) {
      alert("Graph has validation errors. Please fix before exporting.");
      return;
    }
    const json = JSON.stringify(graph, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "graph.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, agents]);

  // Zoom view handlers
  const handleZoomToNode = useCallback(
    (nodeId: string) => {
      // Use original state if already in zoom view, otherwise use current state
      const sourceNodes = savedGraphState?.nodes ?? nodes;
      const sourceEdges = savedGraphState?.edges ?? edges;

      // Only save state if not already in zoom view
      if (!savedGraphState) {
        setSavedGraphState({
          nodes: [...nodes],
          edges: [...edges],
          viewport: getViewport(),
        });
      }

      // Find connected edges from the source (original) state
      const connectedEdges = sourceEdges.filter(
        (e) => e.source === nodeId || e.target === nodeId,
      );

      // Find connected node IDs
      const connectedNodeIds = new Set([
        nodeId,
        ...connectedEdges.map((e) => e.source),
        ...connectedEdges.map((e) => e.target),
      ]);

      // Filter nodes from the source (original) state
      const filteredNodes = sourceNodes.filter((n) =>
        connectedNodeIds.has(n.id),
      );

      // Calculate node dimensions for layout
      const nodeDimensions: Record<string, { width: number; height: number }> =
        {};
      filteredNodes.forEach((n) => {
        const isStart = n.type === "start";
        nodeDimensions[n.id] = {
          width: isStart
            ? START_NODE_WIDTH
            : ((n.data as RFNodeData).nodeWidth ?? DEFAULT_NODE_WIDTH),
          height: isStart ? START_NODE_HEIGHT : DEFAULT_NODE_HEIGHT,
        };
      });

      // Prepare nodes for layoutGraph (schema format)
      const schemaNodes = filteredNodes.map((n) => ({
        id: n.id,
        text: (n.data as RFNodeData).text,
        description: (n.data as RFNodeData).description,
        kind: "agent" as const,
        global: (n.data as RFNodeData).global ?? false,
      }));

      // Prepare edges for layoutGraph (schema format with from/to)
      const schemaEdges = connectedEdges.map((e) => ({
        from: e.source,
        to: e.target,
      }));

      // Recalculate positions
      const layoutResult = layoutGraph(schemaNodes, schemaEdges, {
        rankdir: "LR",
        horizontalSpacing: 250,
        verticalSpacing: 100,
        nodeDimensions,
      });

      // Apply new positions to filtered nodes
      const repositionedNodes = filteredNodes.map((n) => {
        const newPos = layoutResult.nodes.find(
          (ln) => ln.id === n.id,
        )?.position;
        return newPos ? { ...n, position: newPos } : n;
      });

      // Clear selection
      setSelectedNodeId(null);
      setSelectedEdgeId(null);

      // Update state (clear selection on nodes/edges too)
      setNodes(repositionedNodes.map((n) => ({ ...n, selected: false })));
      setEdges(connectedEdges.map((e) => ({ ...e, selected: false })));
      setZoomViewNodeId(nodeId);

      // Fit viewport after a short delay, but don't zoom in beyond current level
      const { zoom: currentZoom } = getViewport();
      setTimeout(
        () => fitView({ padding: 0.3, duration: 300, maxZoom: currentZoom }),
        50,
      );
    },
    [nodes, edges, savedGraphState, getViewport, setNodes, setEdges, fitView],
  );

  const handleExitZoomView = useCallback(() => {
    if (savedGraphState) {
      setNodes(savedGraphState.nodes);
      setEdges(savedGraphState.edges);
      setViewport(savedGraphState.viewport, { duration: 300 });
      setSavedGraphState(null);
      setZoomViewNodeId(null);
    }
  }, [savedGraphState, setNodes, setEdges, setViewport]);

  // Simulation state
  const simulation = useSimulation({
    allNodes: nodes,
    edges,
    agents,
    preset: presetsHook.activePreset,
    apiKey: presetsHook.apiKey,
    onZoomToNode: handleZoomToNode,
    onExitZoomView: handleExitZoomView,
  });

  const displayEdges = edges;

  // Filter global nodes out of the canvas
  const displayNodes = nodes.filter(
    (n) => (n.data as RFNodeData).global !== true,
  );

  // Merge user-defined + edge-derived context precondition names
  const edgeContextPreconditions = useMemo(() => {
    const set = new Set<string>();
    for (const edge of edges) {
      const cp = (edge.data as RFEdgeData | undefined)?.contextPreconditions;
      if (cp) {
        for (const p of cp.preconditions) {
          set.add(p);
        }
      }
    }
    return set;
  }, [edges]);

  const allContextPreconditions = useMemo(() => {
    const merged = new Set([
      ...customContextPreconditions,
      ...edgeContextPreconditions,
    ]);
    return Array.from(merged).sort();
  }, [customContextPreconditions, edgeContextPreconditions]);

  const handleContextValue = {
    onSourceHandleClick,
    onZoomToNode: handleZoomToNode,
  };

  return (
    <HandleContext.Provider value={handleContextValue}>
      <div className="flex h-screen w-screen flex-col items-center">
        <Toolbar
          onAddNode={handleAddNode}
          onImport={handleImport}
          onExport={handleExport}
          onPlay={simulation.start}
          simulationActive={simulation.active}
          statusSlot={<StatusButton nodes={nodes} edges={edges} />}
          globalPanelOpen={globalPanelOpen}
          onToggleGlobalPanel={() => setGlobalPanelOpen((prev) => !prev)}
          onTogglePresets={() => setPresetsOpen((prev) => !prev)}
        />

        <div className="h-screen w-screen relative flex-1 overflow-hidden">
          <main ref={reactFlowWrapper} className="absolute inset-0">
            <ReactFlow
              nodes={displayNodes}
              edges={displayEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            >
              <Background />
              <Controls />
              <MiniMap
                nodeStrokeWidth={3}
                nodeColor={(node) => {
                  if (node.id === START_NODE_ID) return "#22c55e";
                  return "#e2e8f0";
                }}
                maskColor="rgba(0, 0, 0, 0.1)"
              />
            </ReactFlow>

            {zoomViewNodeId && (
              <div className="absolute top-4 left-4 z-10">
                <Button
                  variant="secondary"
                  onClick={simulation.active ? simulation.stop : handleExitZoomView}
                >
                  <X className="h-3 w-3" />
                  {simulation.active ? 'Stop simulation' : 'Quit zoom view'}
                </Button>
              </div>
            )}

            {simulation.active && (
              <SimulationPanel
                steps={simulation.steps}
                totalTokens={simulation.totalTokens}
                currentNode={simulation.currentNode}
                loading={simulation.loading}
                onSendMessage={simulation.sendMessage}
                onStop={simulation.stop}
              />
            )}
          </main>

          <SearchDialog
            nodes={nodes.map((n) => ({
              id: n.id,
              text: (n.data as RFNodeData).text,
            }))}
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            onSelectNode={handleSearchSelectNode}
          />

          {!simulation.active && (selectedNodeId || selectedEdgeId) && (
            <aside className="absolute right-0 top-0 bottom-0 w-80 border-l border-gray-200 bg-white">
              {selectedNodeId && (
                <NodePanel
                  nodeId={selectedNodeId}
                  allNodes={nodes}
                  agents={agents}
                  presets={presetsHook.presets}
                  activePresetId={presetsHook.activePresetId}
                  apiKey={presetsHook.apiKey}
                  globalNodeIds={nodes.filter((n) => (n.data as RFNodeData).global === true).map((n) => n.id)}
                  onSetActivePreset={presetsHook.setActivePresetId}
                  onNodeDeleted={() => setSelectedNodeId(null)}
                  onNodeIdChanged={(newId) => setSelectedNodeId(newId)}
                  onSelectEdge={(edgeId) => {
                    // Update React Flow selection state
                    setNodes((nds) =>
                      nds.map((n) => ({ ...n, selected: false })),
                    );
                    setEdges((eds) =>
                      eds.map((e) => ({ ...e, selected: e.id === edgeId })),
                    );
                    setSelectedEdgeId(edgeId);
                    setSelectedNodeId(null);
                  }}
                  onSelectNode={(targetNodeId) => {
                    const node = nodes.find((n) => n.id === targetNodeId);
                    if (node && reactFlowWrapper.current) {
                      const nodeData = node.data as RFNodeData;
                      const nodeWidth = nodeData.nodeWidth ?? 180;
                      const nodeHeight =
                        node.type === "start"
                          ? START_NODE_HEIGHT
                          : DEFAULT_NODE_HEIGHT;
                      const { zoom } = getViewport();
                      const { width, height } =
                        reactFlowWrapper.current.getBoundingClientRect();

                      const nodeCenterX = node.position.x + nodeWidth / 2;
                      const nodeCenterY = node.position.y + nodeHeight / 2;

                      setViewport(
                        {
                          x: width / 2 - nodeCenterX * zoom,
                          y: height / 2 - nodeCenterY * zoom,
                          zoom,
                        },
                        { duration: 300 },
                      );
                    }
                    // Update React Flow selection state
                    setNodes((nds) =>
                      nds.map((n) => ({
                        ...n,
                        selected: n.id === targetNodeId,
                      })),
                    );
                    setEdges((eds) =>
                      eds.map((e) => ({ ...e, selected: false })),
                    );
                    setSelectedNodeId(targetNodeId);
                  }}
                />
              )}
              {selectedEdgeId && (
                <EdgePanel
                  edgeId={selectedEdgeId}
                  onEdgeDeleted={() => setSelectedEdgeId(null)}
                  availableContextPreconditions={allContextPreconditions}
                  onSelectNode={(nodeId) => {
                    const node = nodes.find((n) => n.id === nodeId);
                    if (node && reactFlowWrapper.current) {
                      const nodeData = node.data as RFNodeData;
                      const nodeWidth = nodeData.nodeWidth ?? 180;
                      const nodeHeight =
                        node.type === "start"
                          ? START_NODE_HEIGHT
                          : DEFAULT_NODE_HEIGHT;
                      const { zoom } = getViewport();
                      const { width, height } =
                        reactFlowWrapper.current.getBoundingClientRect();

                      // Calculate node center
                      const nodeCenterX = node.position.x + nodeWidth / 2;
                      const nodeCenterY = node.position.y + nodeHeight / 2;

                      // Calculate viewport position to center the node
                      setViewport(
                        {
                          x: width / 2 - nodeCenterX * zoom,
                          y: height / 2 - nodeCenterY * zoom,
                          zoom,
                        },
                        { duration: 300 },
                      );
                    }
                    // Update React Flow selection state
                    setNodes((nds) =>
                      nds.map((n) => ({ ...n, selected: n.id === nodeId })),
                    );
                    setEdges((eds) =>
                      eds.map((e) => ({ ...e, selected: false })),
                    );
                    setSelectedNodeId(nodeId);
                    setSelectedEdgeId(null);
                  }}
                />
              )}
            </aside>
          )}

          {globalPanelOpen && (
            <aside className="absolute right-0 top-0 bottom-0 w-80 border-l border-gray-200 bg-white">
              <GlobalNodesPanel
                nodes={nodes}
                onAddNode={() => {
                  const id = `node_${nanoid(8)}`;
                  const newNode: Node<RFNodeData> = {
                    id,
                    type: "agent",
                    position: { x: 0, y: 0 },
                    data: {
                      nodeId: id,
                      text: "New global node",
                      description: "",
                      global: true,
                      nodeWidth: GRAPH_DATA?.nodeWidth ?? 180,
                    },
                  };
                  setNodes((nds) => [...nds, newNode]);
                }}
                onDeleteNode={(nodeId) => {
                  setNodes((nds) => nds.filter((n) => n.id !== nodeId));
                  setEdges((eds) =>
                    eds.filter(
                      (e) => e.source !== nodeId && e.target !== nodeId,
                    ),
                  );
                }}
                onUpdateNode={(nodeId, updates) => {
                  setNodes((nds) =>
                    nds.map((n) =>
                      n.id === nodeId
                        ? {
                            ...n,
                            data: {
                              ...(n.data as RFNodeData),
                              ...updates,
                            },
                          }
                        : n,
                    ),
                  );
                }}
                onSetDefaultFallback={(nodeId) => {
                  setNodes((nds) =>
                    nds.map((n) => ({
                      ...n,
                      data: {
                        ...(n.data as RFNodeData),
                        defaultFallback: n.id === nodeId ? true : undefined,
                      },
                    })),
                  );
                }}
                contextPreconditions={allContextPreconditions}
                onAddContextPrecondition={(value) => {
                  setCustomContextPreconditions((prev) =>
                    prev.includes(value) ? prev : [...prev, value],
                  );
                }}
                onRemoveContextPrecondition={(value) => {
                  setCustomContextPreconditions((prev) =>
                    prev.filter((p) => p !== value),
                  );
                  setEdges((eds) =>
                    eds.map((e) => {
                      const cp = (e.data as RFEdgeData | undefined)
                        ?.contextPreconditions;
                      if (!cp) return e;
                      const filtered = cp.preconditions.filter(
                        (p) => p !== value,
                      );
                      return {
                        ...e,
                        data: {
                          ...e.data,
                          contextPreconditions:
                            filtered.length > 0
                              ? { ...cp, preconditions: filtered }
                              : undefined,
                        },
                      };
                    }),
                  );
                }}
                onRenameContextPrecondition={(oldValue, newValue) => {
                  setCustomContextPreconditions((prev) =>
                    prev.map((p) => (p === oldValue ? newValue : p)),
                  );
                  setEdges((eds) =>
                    eds.map((e) => {
                      const cp = (e.data as RFEdgeData | undefined)
                        ?.contextPreconditions;
                      if (!cp) return e;
                      const renamed = cp.preconditions.map((p) =>
                        p === oldValue ? newValue : p,
                      );
                      return {
                        ...e,
                        data: {
                          ...e.data,
                          contextPreconditions: {
                            ...cp,
                            preconditions: renamed,
                          },
                        },
                      };
                    }),
                  );
                }}
              />
            </aside>
          )}

          {presetsOpen && (
            <aside className="absolute left-0 top-0 bottom-0 w-80 border-r border-gray-200 bg-white z-10">
              <PresetsPanel
                presets={presetsHook.presets}
                apiKey={presetsHook.apiKey}
                onApiKeyChange={presetsHook.setApiKey}
                onAdd={presetsHook.addPreset}
                onDelete={presetsHook.deletePreset}
                onUpdate={presetsHook.updatePreset}
              />
            </aside>
          )}

          {connectionMenu && (
            <ConnectionMenu
              position={connectionMenu.position}
              sourceNodeId={connectionMenu.sourceNodeId}
              sourceHandleId={connectionMenu.sourceHandleId}
              nodes={nodes.map((n) => ({
                id: n.id,
                text: (n.data as RFNodeData).text,
              }))}
              onSelectNode={handleConnectionMenuSelectNode}
              onCreateNode={handleConnectionMenuCreateNode}
              onClose={handleConnectionMenuClose}
            />
          )}
        </div>
      </div>
    </HandleContext.Provider>
  );
}

export function GraphBuilder() {
  return (
    <ReactFlowProvider>
      <GraphBuilderInner />
    </ReactFlowProvider>
  );
}
