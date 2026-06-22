import type { Graph, McpServerConfig } from '@daviddh/graph-types';
import { buildResolvedVars, resolveTransport } from '@daviddh/graph-types';
import { type McpClientHandle, connectMcp, createTransport } from '@daviddh/llm-graph-runner';

import { getDecryptedEnvVariables } from '../../db/queries/executionAuthQueries.js';
import { assembleGraph } from '../../db/queries/graphQueries.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DiscoveredTool {
  name: string;
  description: string | undefined;
  inputSchema: unknown;
}

export interface CallToolInput {
  agentId: string;
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function requireGraph(graph: Graph | null, agentId: string): Graph {
  if (graph === null) throw new Error(`Graph not found for agent: ${agentId}`);
  return graph;
}

function requireServer(graph: Graph, serverId: string): McpServerConfig {
  const server = (graph.mcpServers ?? []).find((s) => s.id === serverId);
  if (server === undefined) throw new Error(`MCP server not found: ${serverId}`);
  return server;
}

async function openClient(ctx: ServiceContext, agentId: string, serverId: string): Promise<McpClientHandle> {
  const graph = requireGraph(await assembleGraph(ctx.supabase, agentId), agentId);
  const server = requireServer(graph, serverId);
  const { byId } = await getDecryptedEnvVariables(ctx.supabase, ctx.orgId);
  const vars = buildResolvedVars(server.variableValues, { byName: {}, byId });
  const transport = resolveTransport(server.transport, vars);
  const wireTransport = createTransport({ ...server, transport });
  return await connectMcp({ transport: wireTransport });
}

/* ------------------------------------------------------------------ */
/*  Service functions                                                  */
/* ------------------------------------------------------------------ */

export async function discoverTools(
  ctx: ServiceContext,
  agentId: string,
  serverId: string
): Promise<DiscoveredTool[]> {
  const handle = await openClient(ctx, agentId, serverId);
  try {
    const tools = await handle.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  } finally {
    await handle.close();
  }
}

export async function callTool(ctx: ServiceContext, input: CallToolInput): Promise<unknown> {
  const { agentId, serverId, toolName, args } = input;
  const handle = await openClient(ctx, agentId, serverId);
  try {
    return await handle.callTool(toolName, args);
  } finally {
    await handle.close();
  }
}
