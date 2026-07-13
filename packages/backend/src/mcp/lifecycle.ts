import type { McpServerConfig } from '@daviddh/graph-types';
import {
  type McpClientHandle,
  type RawMcpTool,
  connectMcp,
  createTransport,
} from '@daviddh/llm-graph-runner';
import { type Tool, jsonSchema } from 'ai';

import { type DiscoveryErrorCategory, classifyDiscoveryError } from '../lib/discoveryError.js';

interface McpClientEntry {
  serverId: string;
  handle: McpClientHandle;
}

/**
 * A failed MCP connect, carrying the server NAME and a redacted failure
 * {@link DiscoveryErrorCategory} only — never the raw upstream message or URL,
 * which can leak secrets / probe targets. Downstream renders an actionable,
 * localized message from these two fields.
 */
export class McpConnectError extends Error {
  readonly serverName: string;
  readonly category: DiscoveryErrorCategory;

  constructor(serverName: string, category: DiscoveryErrorCategory) {
    super(`MCP connect failed: ${category}`);
    this.name = 'McpConnectError';
    this.serverName = serverName;
    this.category = category;
  }
}

export interface McpSession {
  clients: McpClientEntry[];
  tools: Record<string, Tool>;
}

const EMPTY_LENGTH = 0;

// DEBUG (remove before merge)
function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

// DEBUG (remove before merge): redacted view of a server's transport auth header —
// EMPTY (`Bearer ` / missing), an unresolved `{{var}}` TEMPLATE, or a resolved length.
function authDebugState(server: McpServerConfig): string {
  const { transport } = server;
  if (transport.type !== 'http' && transport.type !== 'sse') return `type=${transport.type}`;
  const auth = transport.headers?.Authorization ?? transport.headers?.authorization ?? '';
  const state =
    auth === '' || auth === 'Bearer ' ? 'EMPTY' : auth.includes('{{') ? 'TEMPLATE' : `resolved(len=${String(auth.length)})`;
  return `origin=${safeOrigin(transport.url)} auth=${state}`;
}

async function connectServer(server: McpServerConfig): Promise<McpClientEntry> {
  const transport = createTransport(server);
  // DEBUG (remove before merge)
  process.stdout.write(`[mcpSession][DEBUG] connecting server=${server.name} ${authDebugState(server)}\n`);
  try {
    const handle = await connectMcp({ transport });
    return { serverId: server.id, handle };
  } catch (err) {
    // DEBUG (remove before merge)
    process.stdout.write(
      `[mcpSession][DEBUG] connect FAILED server=${server.name}: ${err instanceof Error ? err.message : String(err)}\n`
    );
    throw new McpConnectError(server.name, classifyDiscoveryError(err));
  }
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
