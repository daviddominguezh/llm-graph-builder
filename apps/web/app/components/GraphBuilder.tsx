"use client";

import { useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
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
import { GraphSchema, type NodeKind } from "../schemas/graph.schema";

function GraphBuilderInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const rfNodes = useGraphStore((s) => s.rfNodes);
  const rfEdges = useGraphStore((s) => s.rfEdges);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const setSelectedEdgeId = useGraphStore((s) => s.setSelectedEdgeId);
  const addNode = useGraphStore((s) => s.addNode);
  const addEdge_ = useGraphStore((s) => s.addEdge);
  const syncRFNodes = useGraphStore((s) => s.syncRFNodes);
  const importGraph = useGraphStore((s) => s.importGraph);
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

  const createNode = useCallback(
    (kind: NodeKind, position: { x: number; y: number }) => {
      const id = `node_${nanoid(8)}`;
      addNode({
        id,
        text: "New node",
        kind,
        description: "",
        position,
      });
      setSelectedNodeId(id);
    },
    [addNode, setSelectedNodeId]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const kind = event.dataTransfer.getData(
        "application/reactflow-kind"
      ) as NodeKind;
      if (!kind) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      createNode(kind, position);
    },
    [screenToFlowPosition, createNode]
  );

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
      <Toolbar onImport={handleImport} onExport={handleExport} />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <main
          ref={reactFlowWrapper}
          className="relative flex-1"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
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

        {/* Right Sidebar */}
        <aside className="w-80 border-l border-gray-200 bg-gray-50">
          {selectedNodeId && <NodePanel nodeId={selectedNodeId} />}
          {selectedEdgeId && <EdgePanel edgeId={selectedEdgeId} />}
          {!selectedNodeId && !selectedEdgeId && <AgentPanel />}
        </aside>
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
