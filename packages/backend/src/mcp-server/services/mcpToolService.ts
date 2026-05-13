import type { Graph, McpServerConfig, McpTransport } from '@daviddh/graph-types';
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

function resolveServerVars(server: McpServerConfig, envVars: Record<string, string>): Record<string, string> {
  const { variableValues } = server;
  if (variableValues === undefined) return envVars;
  const resolved: Record<string, string> = {};
  for (const [templateName, val] of Object.entries(variableValues)) {
    if (val.type === 'direct') {
      const { value } = val;
      resolved[templateName] = value;
    } else {
      const { envVariableId } = val;
      resolved[templateName] = envVars[envVariableId] ?? '';
    }
  }
  return resolved;
}

async function openClient(ctx: ServiceContext, agentId: string, serverId: string): Promise<McpClientHandle> {
  const graph = requireGraph(await assembleGraph(ctx.supabase, agentId), agentId);
  const server = requireServer(graph, serverId);
  const { byId } = await getDecryptedEnvVariables(ctx.supabase, ctx.orgId);
  const vars = resolveServerVars(server, byId);
  const transport = resolveTransportVars(server.transport, vars);
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
