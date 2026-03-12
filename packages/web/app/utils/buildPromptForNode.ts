import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { buildNextAgentConfig, createDummyToolsForGraph } from '@daviddh/llm-graph-runner';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

import type { Agent } from '../schemas/graph.schema';
import type { ContextPreset } from '../types/preset';
import { buildContext, buildGraph } from './graphContext';
import type { RFEdgeData, RFNodeData } from './graphTransformers';

const PREVIEW_API_KEY_PLACEHOLDER = '<api-key-hidden>';

interface BuildPromptParams {
  nodes: Array<RFNode<RFNodeData>>;
  edges: Array<RFEdge<RFEdgeData>>;
  nodeId: string;
  preset: ContextPreset;
  agents: Agent[];
  outputSchemas?: OutputSchemaEntity[];
}

export async function buildPromptForNode(params: BuildPromptParams): Promise<string> {
  const { nodes, edges, nodeId, preset, agents, outputSchemas } = params;

  const graph = buildGraph(nodes, edges, agents, undefined, outputSchemas);
  const context = { ...buildContext(preset, PREVIEW_API_KEY_PLACEHOLDER), graph };
  const dummyTools = createDummyToolsForGraph(graph);
  const config = await buildNextAgentConfig(graph, context, nodeId, { toolsOverride: dummyTools });

  return config.prompt;
}
