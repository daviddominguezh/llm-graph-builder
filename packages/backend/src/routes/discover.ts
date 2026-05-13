import { type McpServerConfig, type McpTransport, McpTransportSchema } from '@daviddh/graph-types';
import { connectMcp, createTransport } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';
import { z } from 'zod';

import type { DiscoverResponse, DiscoveredTool } from '../types.js';

const HTTP_BAD_REQUEST = 400;

const DiscoverBodySchema = z.object({
  transport: McpTransportSchema,
});

function parseTransport(body: unknown): McpTransport {
  const result = DiscoverBodySchema.safeParse(body);
  if (!result.success) {
    throw new Error(`Invalid transport config: ${result.error.message}`);
  }
  return result.data.transport;
}

function transportToServerConfig(transport: McpTransport): McpServerConfig {
  return {
    id: 'discover',
    name: 'discover',
    transport,
    enabled: true,
  };
}

async function discoverFromTransport(transport: McpTransport): Promise<DiscoverResponse> {
  const wireTransport = createTransport(transportToServerConfig(transport));
  const handle = await connectMcp({ transport: wireTransport });
  try {
    const rawTools = await handle.listTools();
    const tools: DiscoveredTool[] = rawTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
    return { tools };
  } finally {
    await handle.close();
  }
}

function logRequest(body: unknown): void {
  process.stdout.write(`[discover] POST /mcp/discover body=${JSON.stringify(body)}\n`);
}

function logError(message: string): void {
  process.stderr.write(`[discover] ERROR: ${message}\n`);
}

function logSuccess(toolCount: number): void {
  process.stdout.write(`[discover] OK: discovered ${String(toolCount)} tools\n`);
}

export async function handleDiscover(req: Request, res: Response): Promise<void> {
  logRequest(req.body);
  try {
    const transport = parseTransport(req.body);
    const result = await discoverFromTransport(transport);
    logSuccess(result.tools.length);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError(message);
    res.status(HTTP_BAD_REQUEST).json({ error: message });
  }
}
