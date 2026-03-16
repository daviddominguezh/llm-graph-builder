import type { Edge, Node } from '@xyflow/react';
import { useCallback } from 'react';

import type { Agent, Graph, McpServerConfig, OutputSchemaEntity } from '../schemas/graph.schema';
import { START_NODE_ID } from '../utils/graphInitializer';
import { serializeGraphData } from '../utils/graphSerializer';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { schemaEdgeToRFEdge, schemaNodeToRFNode } from '../utils/graphTransformers';
import { relayoutGraph } from '../utils/loadGraphData';
import { buildUpdateNodeOp } from '../utils/operationBuilders';
import type { PushOperation } from '../utils/operationBuilders';

interface UseFormatGraphParams {
  nodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
  agents: Agent[];
  mcpServers: McpServerConfig[];
  outputSchemas: OutputSchemaEntity[];
  setNodes: (
    nodes: Array<Node<RFNodeData>> | ((nds: Array<Node<RFNodeData>>) => Array<Node<RFNodeData>>)
  ) => void;
  setEdges: (
    edges: Array<Edge<RFEdgeData>> | ((eds: Array<Edge<RFEdgeData>>) => Array<Edge<RFEdgeData>>)
  ) => void;
  pushOperation: PushOperation;
}

function mapLayoutedNode(n: Graph['nodes'][number], i: number, nodeWidth: number): Node<RFNodeData> {
  const baseNode = schemaNodeToRFNode(n, i);
  const isStartNode = n.id === START_NODE_ID;
  return {
    ...baseNode,
    type: isStartNode ? 'start' : baseNode.type,
    selectable: !isStartNode,
    draggable: false,
    data: { ...baseNode.data, nodeWidth },
  };
}

export function useFormatGraph(params: UseFormatGraphParams): () => void {
  const { nodes, edges, agents, mcpServers, outputSchemas, setNodes, setEdges, pushOperation } = params;

  return useCallback(() => {
    const graph = serializeGraphData({ nodes, edges, agents, mcpServers, outputSchemas });
    if (graph === null) return;

    const { graph: layouted, nodeWidth } = relayoutGraph(graph);

    const rfNodes = layouted.nodes.map((n, i) => mapLayoutedNode(n, i, nodeWidth));
    const rfEdges = layouted.edges.map((e, i) => schemaEdgeToRFEdge(e, i, layouted.nodes));

    setNodes(rfNodes);
    setEdges(rfEdges);

    for (const rfNode of rfNodes) {
      pushOperation(buildUpdateNodeOp(rfNode));
    }
  }, [nodes, edges, agents, mcpServers, outputSchemas, setNodes, setEdges, pushOperation]);
}
