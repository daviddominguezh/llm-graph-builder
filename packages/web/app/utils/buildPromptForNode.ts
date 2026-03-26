import { buildNextAgentConfig, createDummyToolsForGraph } from '@daviddh/llm-graph-runner';

import type { ContextPreset } from '../types/preset';
import { type GraphBuildInputs, buildContext, buildGraph } from './graphContext';

const PREVIEW_API_KEY_PLACEHOLDER = '<api-key-hidden>';

interface BuildPromptParams extends GraphBuildInputs {
  nodeId: string;
  preset: ContextPreset;
}

export async function buildPromptForNode(params: BuildPromptParams): Promise<string> {
  const { nodes, edges, nodeId, preset, agents, outputSchemas } = params;

  const graph = buildGraph(nodes, edges, agents, undefined, outputSchemas);
  const context = { ...buildContext(preset, PREVIEW_API_KEY_PLACEHOLDER), graph, modelId: '' };
  const dummyTools = createDummyToolsForGraph(graph);
  const config = await buildNextAgentConfig(graph, context, nodeId, { toolsOverride: dummyTools });

  return config.prompt;
}
