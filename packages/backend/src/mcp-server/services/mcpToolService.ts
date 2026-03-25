import type { createMCPClient } from '@ai-sdk/mcp';
import type { Graph, McpServerConfig, McpTransport } from '@daviddh/graph-types';

import { getDecryptedEnvVariables } from '../../db/queries/executionAuthQueries.js';
import { assembleGraph } from '../../db/queries/graphQueries.js';
import { connectMcpClient } from '../../mcp/client.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;

export interface DiscoveredTool {
  name: string;
  description: string | undefined;
  inputSchema: Record<string, unknown>;
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

const VARIABLE_PATTERN = /\{\{(?<name>\w+)\}\}/gv;

function replaceVars(str: string, vars: Record<string, string>): string {
  return str.replace(VARIABLE_PATTERN, (_, name: string) => vars[name] ?? `{{${name}}}`);
}

function resolveTransportVars(transport: McpTransport, vars: Record<string, string>): McpTransport {
  if (transport.type === 'stdio') {
    return {
      ...transport,
      command: replaceVars(transport.command, vars),
      args: transport.args?.map((a) => replaceVars(a, vars)),
    };
  }
  return {
    ...transport,
    url: replaceVars(transport.url, vars),
  };
}

async function openClient(
  ctx: ServiceContext,
  agentId: string,
  serverId: string
): Promise<{ client: McpClient; transport: McpTransport }> {
  const graph = requireGraph(await assembleGraph(ctx.supabase, agentId), agentId);
  const server = requireServer(graph, serverId);
  const envVars = await getDecryptedEnvVariables(ctx.supabase, ctx.orgId);
  const transport = resolveTransportVars(server.transport, envVars);
  const client = await connectMcpClient(transport);
  return { client, transport };
}

/* ------------------------------------------------------------------ */
/*  Service functions                                                  */
/* ------------------------------------------------------------------ */

export async function discoverTools(
  ctx: ServiceContext,
  agentId: string,
  serverId: string
): Promise<DiscoveredTool[]> {
  const { client } = await openClient(ctx, agentId, serverId);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  } finally {
    await client.close();
  }
}

export async function callTool(
  ctx: ServiceContext,
  agentId: string,
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const { client } = await openClient(ctx, agentId, serverId);
  try {
    const toolSet = await client.tools();
    const tool = toolSet[toolName];
    if (tool === undefined) throw new Error(`Tool not found: ${toolName}`);
    return await tool.execute(args, { toolCallId: toolName, messages: [] });
  } finally {
    await client.close();
  }
}
