import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { useCallback } from 'react';
import { toast } from 'sonner';

import type { Graph, McpServerConfig, Edge as SchemaEdge, Node as SchemaNode } from '../schemas/graph.schema';
import { GraphSchema } from '../schemas/graph.schema';
import { START_NODE_ID } from '../utils/graphInitializer';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { schemaEdgeToRFEdge, schemaNodeToRFNode } from '../utils/graphTransformers';
import { calculateInitialViewport, findInitialNodePosition, processGraph } from '../utils/loadGraphData';

const VIEWPORT_DELAY = 50;
const FIRST_FILE_INDEX = 0;

type NodeArray = Array<Node<RFNodeData>>;
type EdgeArray = Array<Edge<RFEdgeData>>;

interface UseImportGraphParams {
  setNodes: (nodes: NodeArray | ((nds: NodeArray) => NodeArray)) => void;
  setEdges: (edges: EdgeArray | ((eds: EdgeArray) => EdgeArray)) => void;
  setViewport: ReactFlowInstance['setViewport'];
  reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
  mcpSetServers: (servers: McpServerConfig[]) => void;
}

function buildImportedNodes(graph: Graph, nodeWidth: number): NodeArray {
  return graph.nodes.map((n: SchemaNode, i: number) => {
    const baseNode = schemaNodeToRFNode(n, i);
    const isStartNode = n.id === START_NODE_ID;
    return {
      ...baseNode,
      type: isStartNode ? 'start' : baseNode.type,
      selectable: !isStartNode,
      draggable: false,
      data: { ...baseNode.data, nodeWidth },
    };
  });
}

function applyImportedGraph(data: Graph, params: UseImportGraphParams): void {
  const { graph, nodeWidth } = processGraph(data);
  const newNodes = buildImportedNodes(graph, nodeWidth);
  const newEdges = graph.edges.map((e: SchemaEdge, i: number) => schemaEdgeToRFEdge(e, i, graph.nodes));

  params.setNodes(newNodes);
  params.setEdges(newEdges);
  params.mcpSetServers(data.mcpServers ?? []);

  const { reactFlowWrapper } = params;
  setTimeout(() => {
    const { current: wrapper } = reactFlowWrapper;
    if (wrapper === null) return;
    const initialPos = findInitialNodePosition(graph);
    if (initialPos !== null) {
      const { clientHeight } = wrapper;
      const viewport = calculateInitialViewport(initialPos, clientHeight);
      void params.setViewport(viewport);
    }
  }, VIEWPORT_DELAY);
}

export function useImportGraph({
  setNodes,
  setEdges,
  setViewport,
  reactFlowWrapper,
  mcpSetServers,
}: UseImportGraphParams): () => void {
  return useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[FIRST_FILE_INDEX];
      if (file === undefined) return;

      void file.text().then((text) => {
        try {
          const json: unknown = JSON.parse(text);
          const result = GraphSchema.safeParse(json);
          if (result.success) {
            applyImportedGraph(result.data, {
              setNodes,
              setEdges,
              setViewport,
              reactFlowWrapper,
              mcpSetServers,
            });
          } else {
            toast.error(`Invalid graph file: ${result.error.message}`);
          }
        } catch {
          toast.error('Failed to parse JSON file');
        }
      });
    };
    input.click();
  }, [setNodes, setEdges, setViewport, reactFlowWrapper, mcpSetServers]);
}
