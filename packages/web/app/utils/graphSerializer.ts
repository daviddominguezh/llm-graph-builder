import type { Edge, Node } from '@xyflow/react';

import type { Agent, Graph, McpServerConfig, OutputSchemaEntity } from '../schemas/graph.schema';
import { GraphSchema } from '../schemas/graph.schema';
import { START_NODE_ID } from './graphInitializer';
import type { RFEdgeData, RFNodeData } from './graphTransformers';
import { rfEdgeToSchemaEdge } from './graphTransformers';

const EMPTY_LENGTH = 0;

interface SerializeNodeInput {
  id: string;
  type: string | undefined;
  data: RFNodeData;
  position: { x: number; y: number };
}

type NodeKind = 'agent' | 'agent_decision';

function resolveKind(type: string | undefined): NodeKind {
  if (type === 'start' || type === 'agent') return 'agent';
  if (type === 'agent_decision') return 'agent_decision';
  return 'agent';
}

function serializeNode(n: SerializeNodeInput): Graph['nodes'][number] {
  return {
    id: n.id,
    text: n.data.text,
    kind: resolveKind(n.type),
    description: n.data.description,
    agent: n.data.agent,
    nextNodeIsUser: n.data.nextNodeIsUser,
    fallbackNodeId: n.data.fallbackNodeId,
    global: n.data.global ?? false,
    defaultFallback: n.data.defaultFallback,
    outputSchemaId: n.data.outputSchemaId,
    outputPrompt: n.data.outputPrompt,
    position: n.position,
  };
}

interface SerializeGraphParams {
  nodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
  agents: Agent[];
  mcpServers: McpServerConfig[];
  outputSchemas: OutputSchemaEntity[];
}

export function serializeGraphData({
  nodes,
  edges,
  agents,
  mcpServers,
  outputSchemas,
}: SerializeGraphParams): Graph | null {
  const graph = {
    startNode: START_NODE_ID,
    agents,
    nodes: nodes.map((n) => serializeNode({ id: n.id, type: n.type, data: n.data, position: n.position })),
    edges: edges.map((e) => rfEdgeToSchemaEdge(e)),
    mcpServers: mcpServers.length > EMPTY_LENGTH ? mcpServers : undefined,
    outputSchemas: outputSchemas.length > EMPTY_LENGTH ? outputSchemas : undefined,
  };

  const result = GraphSchema.safeParse(graph);
  if (!result.success) {
    globalThis.console.error('[serializeGraphData] schema validation failed', result.error);
    return null;
  }
  return result.data;
}
