"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  useStoreApi,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  type Node,
  type Edge,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nanoid } from "nanoid";

import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges";
import { Toolbar } from "./panels/Toolbar";
import { NodePanel } from "./panels/NodePanel";
import { EdgePanel } from "./panels/EdgePanel";
import { AgentPanel } from "./panels/AgentPanel";
import { useGraphStore } from "../stores/graphStore";
import { GraphSchema } from "../schemas/graph.schema";
import { layoutGraph } from "../utils/layoutGraph";
import graphData from "../data/graph2.json";

const MIN_DISTANCE = 150;

function GraphBuilderInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const store = useStoreApi();
  const { screenToFlowPosition, fitView, getViewport, getInternalNode, setViewport } = useReactFlow();
  const [tempEdge, setTempEdge] = useState<Edge | null>(null);
  const [nodesHavePositions, setNodesHavePositions] = useState<boolean | null>(null);
  const [nodeWidth, setNodeWidth] = useState<number | null>(null);
  const importGraph = useGraphStore((s) => s.importGraph);

  // Load and validate graph.json on mount
  useEffect(() => {
    console.log("[GraphBuilder] Validating graph.json...");
    const result = GraphSchema.safeParse(graphData);
    if (result.success) {
      console.log("[GraphBuilder] ✓ Graph validation successful");
      console.log("[GraphBuilder] Graph summary:", {
        startNode: result.data.startNode,
        agents: result.data.agents.length,
        nodes: result.data.nodes.length,
        edges: result.data.edges.length,
      });

      // Calculate node width based on longest ID
      const maxIdLength = Math.max(...result.data.nodes.map((n) => n.id.length));
      const nodePadding = 40; // padding inside the node
      const calculatedWidth = maxIdLength * 7.5 + nodePadding;
      setNodeWidth(calculatedWidth);
      console.log("[GraphBuilder] Node width calculated:", calculatedWidth, `(max ID length: ${maxIdLength})`);

      // Check if nodes have positions (only once on load)
      const hasPositions = result.data.nodes.every(
        (node) => node.position !== undefined
      );
      setNodesHavePositions(hasPositions);
      console.log("[GraphBuilder] Nodes have positions:", hasPositions);

      // Calculate positions if nodes don't have them
      let graphToImport = result.data;
      if (!hasPositions) {
        console.log("[GraphBuilder] Calculating node positions...");
        const horizontalGap = 200;
        const nodesWithPositions = layoutGraph(result.data.nodes, result.data.edges, {
          horizontalSpacing: calculatedWidth + horizontalGap,
        });
        graphToImport = {
          ...result.data,
          nodes: nodesWithPositions,
        };
        console.log("[GraphBuilder] ✓ Positions calculated");
      }

      importGraph(graphToImport);

      // Position viewport so INITIAL_STEP is centered vertically and aligned left
      setTimeout(() => {
        const initialNode = graphToImport.nodes.find((n) => n.id === "INITIAL_STEP");
        if (initialNode?.position && reactFlowWrapper.current) {
          const { height } = reactFlowWrapper.current.getBoundingClientRect();
          const nodeHeight = 120; // Approximate node height
          const padding = 50; // Left padding

          setViewport({
            x: -initialNode.position.x + padding,
            y: -initialNode.position.y + height / 2 - nodeHeight / 2,
            zoom: 1,
          });
        } else {
          fitView({ padding: 0.2 });
        }
      }, 100);
    } else {
      console.error("[GraphBuilder] ✗ Graph validation failed:");
      console.error(result.error.format());
    }
  }, [importGraph, fitView, setViewport]);

  const rfNodes = useGraphStore((s) => s.rfNodes);
  const rfEdges = useGraphStore((s) => s.rfEdges);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);

  const nodesWithMuted = useMemo(
    () =>
      rfNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          muted: selectedNodeId !== null && node.id !== selectedNodeId,
          nodeWidth,
        },
      })),
    [rfNodes, selectedNodeId, nodeWidth]
  );

  const edgesWithSelection = useMemo(
    () =>
      rfEdges.map((edge) => ({
        ...edge,
        selected: edge.id === selectedEdgeId,
        data: {
          ...edge.data,
          muted: selectedNodeId !== null && edge.source !== selectedNodeId,
        },
      })),
    [rfEdges, selectedEdgeId, selectedNodeId]
  );
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const setSelectedEdgeId = useGraphStore((s) => s.setSelectedEdgeId);
  const addNode = useGraphStore((s) => s.addNode);
  const addEdge_ = useGraphStore((s) => s.addEdge);
  const syncRFNodes = useGraphStore((s) => s.syncRFNodes);
  const exportGraph = useGraphStore((s) => s.exportGraph);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // Filter out non-position changes that could cause loops
      const meaningfulChanges = changes.filter(
        (change) =>
          change.type === "position" ||
          change.type === "remove" ||
          change.type === "select"
      );
      if (meaningfulChanges.length === 0) return;

      const newNodes = applyNodeChanges(changes, rfNodes);
      syncRFNodes(newNodes);
    },
    [rfNodes, syncRFNodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      // We handle edge changes through the store
      applyEdgeChanges(changes, rfEdges);
    },
    [rfEdges]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        addEdge_({ from: params.source, to: params.target });
      }
    },
    [addEdge_]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: { id: string }) => {
      setSelectedEdgeId(edge.id);
    },
    [setSelectedEdgeId]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [setSelectedNodeId, setSelectedEdgeId]);

  const getClosestEdge = useCallback(
    (node: Node) => {
      const { nodeLookup } = store.getState();
      const internalNode = getInternalNode(node.id);
      if (!internalNode) return null;

      const closestNode = Array.from(nodeLookup.values()).reduce(
        (res: { distance: number; node: typeof internalNode | null }, n) => {
          if (n.id !== internalNode.id) {
            const dx =
              n.internals.positionAbsolute.x -
              internalNode.internals.positionAbsolute.x;
            const dy =
              n.internals.positionAbsolute.y -
              internalNode.internals.positionAbsolute.y;
            const d = Math.sqrt(dx * dx + dy * dy);

            if (d < res.distance && d < MIN_DISTANCE) {
              res.distance = d;
              res.node = n;
            }
          }
          return res;
        },
        { distance: Number.MAX_VALUE, node: null }
      );

      if (!closestNode.node) {
        return null;
      }

      const closeNodeIsSource =
        closestNode.node.internals.positionAbsolute.x <
        internalNode.internals.positionAbsolute.x;

      return {
        id: closeNodeIsSource
          ? `${closestNode.node.id}-${node.id}`
          : `${node.id}-${closestNode.node.id}`,
        source: closeNodeIsSource ? closestNode.node.id : node.id,
        target: closeNodeIsSource ? node.id : closestNode.node.id,
      };
    },
    [store, getInternalNode]
  );

  const onNodeDrag = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const closeEdge = getClosestEdge(node);

      if (closeEdge) {
        // Check if edge already exists
        const edgeExists = rfEdges.some(
          (e) => e.source === closeEdge.source && e.target === closeEdge.target
        );
        if (!edgeExists) {
          setTempEdge({ ...closeEdge, className: "temp opacity-50" });
        } else {
          setTempEdge(null);
        }
      } else {
        setTempEdge(null);
      }
    },
    [getClosestEdge, rfEdges]
  );

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const closeEdge = getClosestEdge(node);
      setTempEdge(null);

      if (closeEdge) {
        // Check if edge already exists
        const edgeExists = rfEdges.some(
          (e) => e.source === closeEdge.source && e.target === closeEdge.target
        );
        if (!edgeExists) {
          addEdge_({ from: closeEdge.source, to: closeEdge.target });
        }
      }
    },
    [getClosestEdge, rfEdges, addEdge_]
  );

  const handleAddNode = useCallback(() => {
    const id = `node_${nanoid(8)}`;
    // Place new node at center of current viewport
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) {
      console.log("[handleAddNode] wrapper is null");
      return;
    }
    const rect = wrapper.getBoundingClientRect();
    console.log("[handleAddNode] wrapper rect:", {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    const screenCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height * 0.3,
    };
    console.log("[handleAddNode] screen center:", screenCenter);
    const position = screenToFlowPosition(screenCenter);
    const viewport = getViewport();
    console.log("[handleAddNode] current viewport:", viewport);
    console.log("[handleAddNode] flow position:", position);
    // Offset by half the node dimensions to center visually
    // AgentNode is approximately 180px wide x 60px tall
    const NODE_WIDTH = 180;
    const NODE_HEIGHT = 60;
    const centeredPosition = {
      x: position.x - NODE_WIDTH / 2,
      y: position.y - NODE_HEIGHT / 2,
    };
    console.log("[handleAddNode] centered position:", centeredPosition);
    addNode({
      id,
      text: "New node",
      kind: "agent",
      description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
      position: centeredPosition,
    });
    setSelectedNodeId(id);
  }, [addNode, setSelectedNodeId, screenToFlowPosition, getViewport]);

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
          importGraph(result.data);
          // Fit view after import with a small delay to ensure nodes are rendered
          setTimeout(() => fitView({ padding: 0.2 }), 50);
        } else {
          alert("Invalid graph file: " + result.error.message);
        }
      } catch {
        alert("Failed to parse JSON file");
      }
    };
    input.click();
  }, [importGraph, fitView]);

  const handleExport = useCallback(() => {
    const graph = exportGraph();
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
  }, [exportGraph]);

  return (
    <div className="flex h-screen w-screen flex-col">
      {/* Header */}
      <Toolbar onAddNode={handleAddNode} onImport={handleImport} onExport={handleExport} />

      {/* Main Content */}
      <div className="relative flex-1 overflow-hidden">
        {/* Canvas - Full size */}
        <main ref={reactFlowWrapper} className="absolute inset-0">
          <ReactFlow
            nodes={nodesWithMuted}
            edges={tempEdge ? [...edgesWithSelection, tempEdge] : edgesWithSelection}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            deleteKeyCode="Delete"
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </main>

        {/* Right Sidebar - Only visible when something is selected */}
        {(selectedNodeId || selectedEdgeId) && (
          <aside className="absolute right-0 top-0 bottom-0 w-80 border-l border-gray-200 bg-white">
            {selectedNodeId && <NodePanel nodeId={selectedNodeId} />}
            {selectedEdgeId && <EdgePanel edgeId={selectedEdgeId} />}
          </aside>
        )}
      </div>
    </div>
  );
}

export function GraphBuilder() {
  return (
    <ReactFlowProvider>
      <GraphBuilderInner />
    </ReactFlowProvider>
  );
}
