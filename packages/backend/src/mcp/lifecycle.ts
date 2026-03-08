import type { createMCPClient } from '@ai-sdk/mcp';
import type { McpServerConfig } from '@daviddh/graph-types';
import type { Tool } from 'ai';

import { connectMcpClient } from './client.js';

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;

interface McpClientEntry {
  serverId: string;
  client: McpClient;
}

export interface McpSession {
  clients: McpClientEntry[];
  tools: Record<string, Tool>;
}

const EMPTY_LENGTH = 0;

async function connectServer(server: McpServerConfig): Promise<McpClientEntry> {
  const client = await connectMcpClient(server.transport);
  return { serverId: server.id, client };
}

async function collectTools(clients: McpClientEntry[]): Promise<Record<string, Tool>> {
  const allTools: Record<string, Tool> = {};
  const toolSets = await Promise.all(clients.map(async (entry) => await entry.client.tools()));
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
    await entry.client.close();
  } catch {
    // Ignore close errors — server may have already disconnected
  }
}

export async function closeMcpSession(session: McpSession): Promise<void> {
  await Promise.all(session.clients.map(closeClient));
}
