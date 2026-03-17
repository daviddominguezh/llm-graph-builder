import { McpTransportSchema } from '@daviddh/graph-types';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { connectMcpClient } from '../mcp/client.js';
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

async function executeToolCall(
  transport: z.infer<typeof McpTransportSchema>,
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolCallResponse> {
  const client = await connectMcpClient(transport);
  try {
    const toolSet = await client.tools();
    const { [toolName]: tool } = toolSet;
    if (tool === undefined) throw new Error(`Tool not found: ${toolName}`);
    const result: unknown = await tool.execute(args, { toolCallId: toolName, messages: [] });
    return { success: true, result };
  } finally {
    await client.close();
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
