import { buildNextAgentConfig, createDummyToolsForGraph } from '@daviddh/llm-graph-runner';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

import type { Agent } from '../schemas/graph.schema';
import type { ContextPreset } from '../types/preset';
import { type RFEdgeData, type RFNodeData, rfEdgeToSchemaEdge } from './graphTransformers';

const START_NODE_ID = 'INITIAL_STEP';

type NodeKind = 'agent' | 'agent_decision';

const toNodeKind = (type: string | undefined): NodeKind =>
  type === 'agent_decision' ? 'agent_decision' : 'agent';

interface BuildPromptParams {
  nodes: Array<RFNode<RFNodeData>>;
  edges: Array<RFEdge<RFEdgeData>>;
  nodeId: string;
  preset: ContextPreset;
  agents: Agent[];
}

function rfNodesToSchemaNodes(nodes: Array<RFNode<RFNodeData>>): Array<{
  id: string;
  text: string;
  kind: NodeKind;
  description: string;
  agent: string | undefined;
  nextNodeIsUser: boolean;
  global: boolean;
}> {
  return nodes.map((n) => ({
    id: n.id,
    text: n.data.text,
    kind: toNodeKind(n.type),
    description: n.data.description,
    agent: n.data.agent,
    nextNodeIsUser: n.data.nextNodeIsUser ?? false,
    global: n.data.global ?? false,
  }));
}

function buildContext(preset: ContextPreset): {
  sessionID: string;
  tenantID: string;
  userID: string;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
} {
  return {
    sessionID: preset.sessionID,
    tenantID: preset.tenantID,
    userID: preset.userID,
    data: preset.data,
    quickReplies: preset.quickReplies,
  };
}

export async function buildPromptForNode(params: BuildPromptParams): Promise<string> {
  const { nodes, edges, nodeId, preset, agents } = params;

  const graph = {
    startNode: START_NODE_ID,
    agents,
    nodes: rfNodesToSchemaNodes(nodes),
    edges: edges.map((e) => rfEdgeToSchemaEdge(e)),
  };

  const context = buildContext(preset);
  const dummyTools = createDummyToolsForGraph(graph);
  const config = await buildNextAgentConfig(graph, context, nodeId, { toolsOverride: dummyTools });

  return config.prompt;
}
