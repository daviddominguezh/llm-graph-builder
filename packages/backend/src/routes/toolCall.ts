import { type McpServerConfig, type McpTransport, McpTransportSchema } from '@daviddh/graph-types';
// `createTransport`/`connectMcp` are typed against the api package's own bundled
// graph-types; aliasing their actual signatures via `typeof` avoids a cross-copy
// `McpServerConfig` identity clash while keeping the seams injectable.
import { connectMcp, createTransport, withAbortTimeout } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { type DiscoveryErrorCategory, classifyDiscoveryError } from '../lib/discoveryError.js';
import { resolveAndAssertEgress } from '../lib/egressGuard.js';
import type { ToolCallSuccessResponse } from '../types.js';

const HTTP_BAD_REQUEST = 400;

/** The api package's wire transport type, derived from `createTransport`'s
 * return so we never re-export it from the api index. */
type WireTransport = ReturnType<typeof createTransport>;

/** Total wall-clock budget for the whole tool-call operation (connect + call). */
export const TOOL_CALL_BUDGET_MS = 8_000;

/**
 * Redacted error response. `/mcp/tools/call` is unauthenticated and the
 * transport is client-supplied, so we return ONLY a closed-taxonomy category —
 * never the raw message, URL, headers, or upstream body (any of which can carry
 * secrets or probe targets).
 */
interface ToolCallErrorResponse {
  success: false;
  errorCategory: DiscoveryErrorCategory;
}

const ToolCallBodySchema = z.object({
  transport: McpTransportSchema,
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
});

type ToolCallBody = z.infer<typeof ToolCallBodySchema>;

/**
 * Injectable seams so tests can stub egress, transport creation, the MCP
 * connection, and the budget without touching the real network or DNS.
 */
export interface ToolCallDeps {
  assertEgress: (url: string) => Promise<void>;
  createTransport: typeof createTransport;
  connectMcp: typeof connectMcp;
  budgetMs: number;
}

const defaultDeps: ToolCallDeps = {
  assertEgress: async (url) => {
    await resolveAndAssertEgress(url, []);
  },
  createTransport,
  connectMcp,
  budgetMs: TOOL_CALL_BUDGET_MS,
};

function parseBody(body: unknown): ToolCallBody | null {
  const result = ToolCallBodySchema.safeParse(body);
  return result.success ? result.data : null;
}

function transportToServerConfig(transport: McpTransport): McpServerConfig {
  return { id: 'tool-call', name: 'tool-call', transport, enabled: true };
}

/** Read the post-substitution URL of an http/sse transport (stdio has no URL). */
function transportUrl(transport: McpTransport): string {
  if (transport.type === 'http' || transport.type === 'sse') return transport.url;
  throw new Error('Unsupported transport type');
}

/**
 * Build a redacted, non-secret-bearing log label for a transport. Mirrors the
 * `/mcp/discover` redaction: log only the URL origin (scheme + host + port) and
 * drop path/query, which can embed auth tokens. Falls back to the type alone if
 * the URL can't be parsed; stdio has no URL so we log only type + command.
 */
function safeTransportLogLabel(transport: McpTransport): string {
  if (transport.type === 'stdio') return `type=${transport.type} command=${transport.command}`;
  try {
    return `type=${transport.type} origin=${new URL(transport.url).origin}`;
  } catch {
    return `type=${transport.type}`;
  }
}

/** A promise that rejects as soon as `signal` aborts (never resolves otherwise). */
async function abortRejection(signal: AbortSignal): Promise<never> {
  const { promise, reject } = Promise.withResolvers<never>();
  signal.addEventListener(
    'abort',
    () => {
      reject(new Error('aborted'));
    },
    { once: true }
  );
  return await promise;
}

/** Connect + call the tool, then close. Best-effort `close()` if the budget aborts mid-flight. */
async function connectAndCallTool(
  wireTransport: WireTransport,
  body: ToolCallBody,
  deps: ToolCallDeps,
  signal: AbortSignal
): Promise<ToolCallSuccessResponse> {
  const handle = await deps.connectMcp({ transport: wireTransport });
  signal.addEventListener(
    'abort',
    () => {
      handle.close().catch(() => undefined);
    },
    { once: true }
  );
  try {
    return { success: true, result: await handle.callTool(body.toolName, body.args) };
  } finally {
    await handle.close();
  }
}

/** Connect + call tool, racing the shared tool-call budget. */
async function runToolCallWithBudget(
  body: ToolCallBody,
  deps: ToolCallDeps
): Promise<ToolCallSuccessResponse> {
  const wireTransport = deps.createTransport(transportToServerConfig(body.transport));
  return await withAbortTimeout(
    deps.budgetMs,
    async (signal) =>
      await Promise.race([connectAndCallTool(wireTransport, body, deps, signal), abortRejection(signal)])
  );
}

async function callFromTransport(body: ToolCallBody, deps: ToolCallDeps): Promise<ToolCallSuccessResponse> {
  await deps.assertEgress(transportUrl(body.transport));
  return await runToolCallWithBudget(body, deps);
}

/** Log only the redacted transport label and tool name — never headers, path, or query. */
function logRequest(body: ToolCallBody): void {
  process.stdout.write(
    `[toolCall] POST /mcp/tools/call tool=${body.toolName} ${safeTransportLogLabel(body.transport)}\n`
  );
}

function logError(category: DiscoveryErrorCategory): void {
  process.stderr.write(`[toolCall] ERROR: ${category}\n`);
}

function logSuccess(toolName: string): void {
  process.stdout.write(`[toolCall] OK: ${toolName} executed\n`);
}

function errorResponse(errorCategory: DiscoveryErrorCategory): ToolCallErrorResponse {
  return { success: false, errorCategory };
}

/**
 * Testable core. Kept separate from the Express handler so `deps` can be
 * injected without colliding with Express's `(req, res, next)` arity.
 */
export async function runToolCall(req: Request, res: Response, deps: ToolCallDeps): Promise<void> {
  const body = parseBody(req.body);
  if (body === null) {
    res.status(HTTP_BAD_REQUEST).json(errorResponse('unknown'));
    return;
  }
  logRequest(body);
  try {
    const result = await callFromTransport(body, deps);
    logSuccess(body.toolName);
    res.json(result);
  } catch (err) {
    const errorCategory = classifyDiscoveryError(err);
    logError(errorCategory);
    res.status(HTTP_BAD_REQUEST).json(errorResponse(errorCategory));
  }
}

/** Express handler — keep arity at 2 so Express never injects `next` as deps. */
export async function handleToolCall(req: Request, res: Response): Promise<void> {
  await runToolCall(req, res, defaultDeps);
}
