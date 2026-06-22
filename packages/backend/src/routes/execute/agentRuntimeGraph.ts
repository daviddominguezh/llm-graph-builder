import type { McpServerConfig, RuntimeGraph } from '@daviddh/graph-types';
import { McpServerConfigSchema } from '@daviddh/graph-types';

export const EMPTY_GRAPH: RuntimeGraph = Object.freeze({
  startNode: 'INITIAL_STEP',
  agents: [],
  nodes: [],
  edges: [],
  initialUserMessage: '',
});

function extractMcpServers(graphData: Record<string, unknown>): McpServerConfig[] {
  const raw = graphData.mcpServers;
  if (!Array.isArray(raw)) return [];
  const servers: McpServerConfig[] = [];
  for (const entry of raw) {
    const parsed = McpServerConfigSchema.safeParse(entry);
    if (parsed.success) servers.push(parsed.data);
  }
  return servers;
}

/** Builds the runtime graph for an agent app from its snapshot: frozen EMPTY_GRAPH
 *  plus any valid mcpServers. Never throws. */
export function buildAgentRuntimeGraph(graphData: Record<string, unknown> | null): RuntimeGraph {
  if (graphData === null) return EMPTY_GRAPH;
  const mcpServers = extractMcpServers(graphData);
  if (mcpServers.length === 0) return EMPTY_GRAPH;
  return { ...EMPTY_GRAPH, mcpServers };
}
