import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

import type { Agent, Edge } from '../schemas/graph.schema';
import type { ContextPreset } from '../types/preset';
import { type RFEdgeData, type RFNodeData, rfEdgeToSchemaEdge } from './graphTransformers';

export const START_NODE_ID = 'INITIAL_STEP';

type NodeKind = 'agent' | 'agent_decision';

export const toNodeKind = (type: string | undefined): NodeKind =>
  type === 'agent_decision' ? 'agent_decision' : 'agent';

interface SchemaNodeLike {
  id: string;
  text: string;
  kind: NodeKind;
  description: string;
  agent: string | undefined;
  nextNodeIsUser: boolean;
  global: boolean;
}

export function rfNodesToSchemaNodes(nodes: Array<RFNode<RFNodeData>>): SchemaNodeLike[] {
  return nodes.map((n) => ({
    id: n.id,
    text: n.data.text,
    kind: toNodeKind(n.type),
    description: n.data.description,
    agent: n.data.agent,
    nextNodeIsUser: n.data.nextNodeIsUser ?? false,
    fallbackNodeId: n.data.fallbackNodeId,
    global: n.data.global ?? false,
  }));
}

interface ContextWithoutGraph {
  apiKey: string;
  sessionID: string;
  tenantID: string;
  userID: string;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
}

export function buildContext(preset: ContextPreset, apiKey: string): ContextWithoutGraph {
  return {
    apiKey,
    sessionID: preset.sessionID,
    tenantID: preset.tenantID,
    userID: preset.userID,
    data: preset.data,
    quickReplies: preset.quickReplies,
  };
}

interface BuiltGraph {
  startNode: string;
  agents: Agent[];
  nodes: SchemaNodeLike[];
  edges: Edge[];
}

export function buildGraph(
  nodes: Array<RFNode<RFNodeData>>,
  edges: Array<RFEdge<RFEdgeData>>,
  agents: Agent[]
): BuiltGraph {
  return {
    startNode: START_NODE_ID,
    agents,
    nodes: rfNodesToSchemaNodes(nodes),
    edges: edges.map((e) => rfEdgeToSchemaEdge(e)),
  };
}
