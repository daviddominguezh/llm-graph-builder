import { type McpTransport, McpTransportSchema } from '@daviddh/graph-types';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { connectMcpClient } from '../mcp/client.js';
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

async function discoverFromTransport(transport: McpTransport): Promise<DiscoverResponse> {
  const client = await connectMcpClient(transport);
  try {
    const result = await client.listTools();
    const tools: DiscoveredTool[] = result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
    return { tools };
  } finally {
    await client.close();
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
