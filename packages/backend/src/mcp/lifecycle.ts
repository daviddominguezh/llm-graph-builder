import type { McpServerConfig } from '@daviddh/graph-types';
import {
  type McpClientHandle,
  type RawMcpTool,
  connectMcp,
  createTransport,
} from '@daviddh/llm-graph-runner';
import { type Tool, jsonSchema } from 'ai';

interface McpClientEntry {
  serverId: string;
  handle: McpClientHandle;
}

export interface McpSession {
  clients: McpClientEntry[];
  tools: Record<string, Tool>;
}

const EMPTY_LENGTH = 0;

async function connectServer(server: McpServerConfig): Promise<McpClientEntry> {
  const transport = createTransport(server);
  const handle = await connectMcp({ transport });
  return { serverId: server.id, handle };
}

function rawToolToAiSdkTool(handle: McpClientHandle, raw: RawMcpTool): Tool {
  return {
    description: raw.description ?? '',
    inputSchema: jsonSchema(raw.inputSchema),
    execute: async (args: unknown) => await handle.callTool(raw.name, args),
  };
}

async function listToolsFor(entry: McpClientEntry): Promise<Record<string, Tool>> {
  const raws = await entry.handle.listTools();
  const out: Record<string, Tool> = {};
  for (const raw of raws) {
    out[raw.name] = rawToolToAiSdkTool(entry.handle, raw);
  }
  return out;
}

async function collectTools(clients: McpClientEntry[]): Promise<Record<string, Tool>> {
  const allTools: Record<string, Tool> = {};
  const toolSets = await Promise.all(clients.map(listToolsFor));
  for (const tools of toolSets) {
    Object.assign(allTools, tools);
  }
  return allTools;
}

export async function createMcpSession(servers: McpServerConfig[]): Promise<McpSession> {
  const enabled = servers.filter((s) => s.enabled);
  if (enabled.length === EMPTY_LENGTH) {
    return { clients: [], tools: {} };
  }

  const clients = await Promise.all(enabled.map(connectServer));
  const tools = await collectTools(clients);
  return { clients, tools };
}

async function closeClient(entry: McpClientEntry): Promise<void> {
  try {
    await entry.handle.close();
  } catch {
    // Ignore close errors — server may have already disconnected
  }
}

export async function closeMcpSession(session: McpSession): Promise<void> {
  await Promise.all(session.clients.map(closeClient));
}
