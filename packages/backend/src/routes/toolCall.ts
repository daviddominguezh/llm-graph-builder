import { type McpServerConfig, type McpTransport, McpTransportSchema } from '@daviddh/graph-types';
import { connectMcp, createTransport } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';
import { z } from 'zod';

import type { ToolCallResponse } from '../types.js';

const HTTP_BAD_REQUEST = 400;

const ToolCallBodySchema = z.object({
  transport: McpTransportSchema,
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
});

function parseBody(body: unknown): z.infer<typeof ToolCallBodySchema> {
  const result = ToolCallBodySchema.safeParse(body);
  if (!result.success) {
    throw new Error(`Invalid request: ${result.error.message}`);
  }
  return result.data;
}

function logRequest(toolName: string): void {
  process.stdout.write(`[toolCall] POST /mcp/tools/call tool=${toolName}\n`);
}

function logError(message: string): void {
  process.stderr.write(`[toolCall] ERROR: ${message}\n`);
}

function logSuccess(toolName: string): void {
  process.stdout.write(`[toolCall] OK: ${toolName} executed\n`);
}

function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function extractErrorCode(err: unknown): string | undefined {
  if (err instanceof Error && 'code' in err) {
    return String((err as Error & { code: unknown }).code);
  }
  return undefined;
}

function transportToServerConfig(transport: McpTransport): McpServerConfig {
  return {
    id: 'tool-call',
    name: 'tool-call',
    transport,
    enabled: true,
  };
}

async function executeToolCall(
  transport: McpTransport,
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolCallResponse> {
  const wireTransport = createTransport(transportToServerConfig(transport));
  const handle = await connectMcp({ transport: wireTransport });
  try {
    const result = await handle.callTool(toolName, args);
    return { success: true, result };
  } finally {
    await handle.close();
  }
}

export async function handleToolCall(req: Request, res: Response): Promise<void> {
  try {
    const { transport, toolName, args } = parseBody(req.body);
    logRequest(toolName);
    const result = await executeToolCall(transport, toolName, args);
    logSuccess(toolName);
    res.json(result);
  } catch (err: unknown) {
    const message = extractErrorMessage(err);
    const code = extractErrorCode(err);
    logError(message);
    res.status(HTTP_BAD_REQUEST).json({ success: false, error: { message, code } });
  }
}
