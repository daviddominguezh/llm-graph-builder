import { type McpServerConfig, type McpTransport, McpTransportSchema } from '@daviddh/graph-types';
// `createTransport`/`connectMcp` are typed against the api package's own bundled
// graph-types; aliasing their actual signatures via `typeof` avoids a cross-copy
// `McpServerConfig` identity clash while keeping the seams injectable.
import { type RawMcpTool, connectMcp, createTransport, withAbortTimeout } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { type DiscoveryErrorCategory, classifyDiscoveryError } from '../lib/discoveryError.js';
import { resolveAndAssertEgress } from '../lib/egressGuard.js';
import type { DiscoverResponse, DiscoveredTool } from '../types.js';

const HTTP_BAD_REQUEST = 400;

/** The api package's wire transport type, derived from `createTransport`'s
 * return so we never re-export it from the api index. */
type WireTransport = ReturnType<typeof createTransport>;

/** Total wall-clock budget for the whole discovery operation (connect + list). */
export const DISCOVERY_BUDGET_MS = 8_000;

const DiscoverBodySchema = z.object({
  transport: McpTransportSchema,
});

/**
 * Injectable seams so tests can stub egress, transport creation, the MCP
 * connection, and the budget without touching the real network or DNS.
 */
export interface DiscoverDeps {
  assertEgress: (url: string) => Promise<void>;
  createTransport: typeof createTransport;
  connectMcp: typeof connectMcp;
  budgetMs: number;
}

const defaultDeps: DiscoverDeps = {
  assertEgress: async (url) => {
    await resolveAndAssertEgress(url, []);
  },
  createTransport,
  connectMcp,
  budgetMs: DISCOVERY_BUDGET_MS,
};

function parseTransport(body: unknown): McpTransport | null {
  const result = DiscoverBodySchema.safeParse(body);
  return result.success ? result.data.transport : null;
}

function transportToServerConfig(transport: McpTransport): McpServerConfig {
  return { id: 'discover', name: 'discover', transport, enabled: true };
}

/** Read the post-substitution URL of an http/sse transport (stdio has no URL). */
function transportUrl(transport: McpTransport): string {
  if (transport.type === 'http' || transport.type === 'sse') return transport.url;
  throw new Error('Unsupported transport type');
}

function mapTools(rawTools: RawMcpTool[]): DiscoveredTool[] {
  return rawTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
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

/** Connect + list, then close. Best-effort `close()` if the budget aborts mid-flight. */
async function connectAndListTools(
  wireTransport: WireTransport,
  deps: DiscoverDeps,
  signal: AbortSignal
): Promise<DiscoverResponse> {
  const handle = await deps.connectMcp({ transport: wireTransport });
  signal.addEventListener(
    'abort',
    () => {
      handle.close().catch(() => undefined);
    },
    { once: true }
  );
  try {
    return { tools: mapTools(await handle.listTools()) };
  } finally {
    await handle.close();
  }
}

/** Connect + list tools, racing the shared discovery budget. */
async function runDiscoveryWithBudget(
  transport: McpTransport,
  deps: DiscoverDeps
): Promise<DiscoverResponse> {
  const wireTransport = deps.createTransport(transportToServerConfig(transport));
  return await withAbortTimeout(
    deps.budgetMs,
    async (signal) =>
      await Promise.race([connectAndListTools(wireTransport, deps, signal), abortRejection(signal)])
  );
}

async function discoverFromTransport(transport: McpTransport, deps: DiscoverDeps): Promise<DiscoverResponse> {
  await deps.assertEgress(transportUrl(transport));
  return await runDiscoveryWithBudget(transport, deps);
}

/** Log only the redacted transport type/url — never headers (avoids secret leak). */
function logRequest(transport: McpTransport): void {
  const url = transport.type === 'stdio' ? '<stdio>' : transport.url;
  process.stdout.write(`[discover] POST /mcp/discover type=${transport.type} url=${url}\n`);
}

function logError(category: DiscoveryErrorCategory): void {
  process.stderr.write(`[discover] ERROR: ${category}\n`);
}

function logSuccess(toolCount: number): void {
  process.stdout.write(`[discover] OK: discovered ${String(toolCount)} tools\n`);
}

/**
 * Testable core. Kept separate from the Express handler so `deps` can be
 * injected without colliding with Express's `(req, res, next)` arity.
 */
export async function runDiscover(req: Request, res: Response, deps: DiscoverDeps): Promise<void> {
  const transport = parseTransport(req.body);
  if (transport === null) {
    res.status(HTTP_BAD_REQUEST).json({ errorCategory: 'unknown' satisfies DiscoveryErrorCategory });
    return;
  }
  logRequest(transport);
  try {
    const result = await discoverFromTransport(transport, deps);
    logSuccess(result.tools.length);
    res.json(result);
  } catch (err) {
    const errorCategory = classifyDiscoveryError(err);
    logError(errorCategory);
    res.status(HTTP_BAD_REQUEST).json({ errorCategory });
  }
}

/** Express handler — keep arity at 2 so Express never injects `next` as deps. */
export async function handleDiscover(req: Request, res: Response): Promise<void> {
  await runDiscover(req, res, defaultDeps);
}
