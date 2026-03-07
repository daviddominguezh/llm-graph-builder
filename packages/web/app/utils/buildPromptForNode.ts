import { buildNextAgentConfig, createDummyToolsForGraph } from '@daviddh/llm-graph-runner';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

import type { Agent } from '../schemas/graph.schema';
import type { ContextPreset } from '../types/preset';
import { buildContext, buildGraph } from './graphContext';
import type { RFEdgeData, RFNodeData } from './graphTransformers';

interface BuildPromptParams {
  nodes: Array<RFNode<RFNodeData>>;
  edges: Array<RFEdge<RFEdgeData>>;
  nodeId: string;
  preset: ContextPreset;
  agents: Agent[];
  apiKey: string;
}

export async function buildPromptForNode(params: BuildPromptParams): Promise<string> {
  const { nodes, edges, nodeId, preset, agents, apiKey } = params;

  const graph = buildGraph(nodes, edges, agents);
  const context = { ...buildContext(preset, apiKey), graph };
  const dummyTools = createDummyToolsForGraph(graph);
  const config = await buildNextAgentConfig(graph, context, nodeId, { toolsOverride: dummyTools });

  return config.prompt;
}
