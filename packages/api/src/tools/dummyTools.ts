import type { Tool } from 'ai';
import { tool } from 'ai';
import z from 'zod';

import type { Graph } from '@src/types/graph.js';

const collectToolNames = (graph: Graph): Set<string> => {
  const toolNames = new Set<string>();
  const preconditions = graph.edges.flatMap((edge) => edge.preconditions ?? []);
  for (const precondition of preconditions) {
    if (precondition.type === 'tool_call') {
      toolNames.add(precondition.tool.toolName);
    }
  }
  return toolNames;
};

export const createDummyToolsForGraph = (graph: Graph): Record<string, Tool> => {
  const toolNames = collectToolNames(graph);
  const tools: Record<string, Tool> = {};
  for (const name of toolNames) {
    tools[name] = tool({
      description: `Preview placeholder for ${name}`,
      inputSchema: z.object({}),
    });
  }
  return tools;
};
