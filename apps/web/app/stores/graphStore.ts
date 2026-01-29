import { create } from "zustand";
import type { Node as RFNode, Edge as RFEdge } from "@xyflow/react";
import type {
  Graph,
  Node as SchemaNode,
  Edge as SchemaEdge,
  Agent,
} from "../schemas/graph.schema";
import {
  schemaNodeToRFNode,
  schemaEdgeToRFEdge,
  rfNodeToSchemaNode,
  type RFNodeData,
  type RFEdgeData,
} from "../utils/graphTransformers";

interface GraphState {
  // Schema data
  startNode: string;
  agents: Agent[];
  nodes: SchemaNode[];
  edges: SchemaEdge[];

  // React Flow data (derived)
  rfNodes: RFNode<RFNodeData>[];
  rfEdges: RFEdge<RFEdgeData>[];

  // UI state
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
}

interface GraphActions {
  // Node operations
  addNode: (node: SchemaNode) => void;
  updateNode: (id: string, updates: Partial<Omit<SchemaNode, "id">>) => void;
  deleteNode: (id: string) => void;
  updateNodePosition: (id: string, x: number, y: number) => void;

  // Edge operations
  addEdge: (edge: SchemaEdge) => void;
  updateEdge: (
    from: string,
    to: string,
    updates: Partial<Omit<SchemaEdge, "from" | "to">>
  ) => void;
  deleteEdge: (from: string, to: string) => void;

  // Agent operations
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, updates: Partial<Omit<Agent, "id">>) => void;
  deleteAgent: (id: string) => void;

  // Selection
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;

  // Import/Export
  importGraph: (graph: Graph) => void;
  exportGraph: () => Graph;

  // Start node
  setStartNode: (id: string) => void;

  // Sync RF nodes (for drag updates from React Flow)
  syncRFNodes: (rfNodes: RFNode[]) => void;
}

type GraphStore = GraphState & GraphActions;

const initialState: GraphState = {
  startNode: "",
  agents: [],
  nodes: [],
  edges: [],
  rfNodes: [],
  rfEdges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
};

export const useGraphStore = create<GraphStore>((set, get) => ({
  ...initialState,

  // Node operations
  addNode: (node) => {
    set((state) => {
      const newNodes = [...state.nodes, node];
      const newRfNodes = newNodes.map(schemaNodeToRFNode);
      return {
        nodes: newNodes,
        rfNodes: newRfNodes,
      };
    });
  },

  updateNode: (id, updates) => {
    set((state) => {
      const newNodes = state.nodes.map((n) =>
        n.id === id ? { ...n, ...updates } : n
      );
      return {
        nodes: newNodes,
        rfNodes: newNodes.map(schemaNodeToRFNode),
      };
    });
  },

  deleteNode: (id) => {
    set((state) => {
      const newNodes = state.nodes.filter((n) => n.id !== id);
      const newEdges = state.edges.filter((e) => e.from !== id && e.to !== id);
      return {
        nodes: newNodes,
        edges: newEdges,
        rfNodes: newNodes.map(schemaNodeToRFNode),
        rfEdges: newEdges.map(schemaEdgeToRFEdge),
        selectedNodeId:
          state.selectedNodeId === id ? null : state.selectedNodeId,
      };
    });
  },

  updateNodePosition: (id, x, y) => {
    set((state) => {
      const newNodes = state.nodes.map((n) =>
        n.id === id ? { ...n, position: { x, y } } : n
      );
      return {
        nodes: newNodes,
        rfNodes: newNodes.map(schemaNodeToRFNode),
      };
    });
  },

  // Edge operations
  addEdge: (edge) => {
    set((state) => {
      const newEdges = [...state.edges, edge];
      return {
        edges: newEdges,
        rfEdges: newEdges.map(schemaEdgeToRFEdge),
      };
    });
  },

  updateEdge: (from, to, updates) => {
    set((state) => {
      const newEdges = state.edges.map((e) =>
        e.from === from && e.to === to ? { ...e, ...updates } : e
      );
      return {
        edges: newEdges,
        rfEdges: newEdges.map(schemaEdgeToRFEdge),
      };
    });
  },

  deleteEdge: (from, to) => {
    set((state) => {
      const edgeId = `${from}-${to}`;
      const newEdges = state.edges.filter(
        (e) => !(e.from === from && e.to === to)
      );
      return {
        edges: newEdges,
        rfEdges: newEdges.map(schemaEdgeToRFEdge),
        selectedEdgeId:
          state.selectedEdgeId === edgeId ? null : state.selectedEdgeId,
      };
    });
  },

  // Agent operations
  addAgent: (agent) => {
    set((state) => ({
      agents: [...state.agents, agent],
    }));
  },

  updateAgent: (id, updates) => {
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
  },

  deleteAgent: (id) => {
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
    }));
  },

  // Selection
  setSelectedNodeId: (id) => {
    set({ selectedNodeId: id, selectedEdgeId: null });
  },

  setSelectedEdgeId: (id) => {
    set({ selectedEdgeId: id, selectedNodeId: null });
  },

  // Import/Export
  importGraph: (graph) => {
    set({
      startNode: graph.startNode,
      agents: graph.agents,
      nodes: graph.nodes,
      edges: graph.edges,
      rfNodes: graph.nodes.map(schemaNodeToRFNode),
      rfEdges: graph.edges.map(schemaEdgeToRFEdge),
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  },

  exportGraph: () => {
    const { startNode, agents, nodes, edges } = get();
    return { startNode, agents, nodes, edges };
  },

  // Start node
  setStartNode: (id) => {
    set({ startNode: id });
  },

  // Sync RF nodes (for position updates from React Flow drag)
  syncRFNodes: (newRfNodes) => {
    set((state) => {
      // Only update schema nodes with new positions, keep rfNodes as-is from React Flow
      const newNodes = state.nodes.map((node) => {
        const rfNode = newRfNodes.find((n) => n.id === node.id);
        if (rfNode) {
          return rfNodeToSchemaNode(rfNode, node);
        }
        return node;
      });
      return {
        nodes: newNodes,
        rfNodes: newRfNodes as RFNode<RFNodeData>[],
      };
    });
  },
}));
