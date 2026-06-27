import { buildPoolKeyFromParts } from './poolKeyShared.js';

/** Portable fetch signature — api core also runs on Workers, so no node:http. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface McpInvokeArgs {
  agentId: string;
  tenantId: string;
  mcpBindingId: string;
  toolName: string;
  args: unknown;
}

export interface McpInvoker {
  invoke: (a: McpInvokeArgs) => Promise<unknown>;
}

export type McpPoolErrorCategory = 'uncertain_outcome' | 'transport' | 'binding';

const ERROR_CATEGORIES: readonly McpPoolErrorCategory[] = ['uncertain_outcome', 'transport', 'binding'];

/**
 * Tool-level error surfaced by the BE MCP pool. `category` lets the runtime
 * distinguish an `uncertain_outcome` (side effect may have happened — do not
 * blind-retry) from a plain `transport` failure or a `binding` problem.
 */
export class McpPoolError extends Error {
  readonly category: McpPoolErrorCategory;

  constructor(category: McpPoolErrorCategory) {
    super(`mcp pool error: ${category}`);
    this.name = 'McpPoolError';
    this.category = category;
  }
}

interface PoolClientOptions {
  baseUrl: string;
  masterKey: string;
  fetch?: FetchLike;
}

function isErrorCategory(value: unknown): value is McpPoolErrorCategory {
  return typeof value === 'string' && (ERROR_CATEGORIES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function categoryFromBody(body: Record<string, unknown>): McpPoolErrorCategory {
  const { category } = body;
  return isErrorCategory(category) ? category : 'transport';
}

function resultFromBody(body: unknown): unknown {
  if (!isRecord(body)) throw new McpPoolError('transport');
  if (body.kind === 'result') return body.result;
  if (body.kind === 'tool_error') throw new McpPoolError(categoryFromBody(body));
  throw new McpPoolError('transport');
}

async function parseResponse(res: Response): Promise<unknown> {
  if (!res.ok) throw new McpPoolError('transport');
  const body: unknown = await res.json();
  return resultFromBody(body);
}

function buildRequestInit(opts: PoolClientOptions, poolKey: string, a: McpInvokeArgs): RequestInit {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-master-key': opts.masterKey,
      'x-mcp-poolkey': poolKey,
    },
    body: JSON.stringify({
      agentId: a.agentId,
      tenantId: a.tenantId,
      mcpBindingId: a.mcpBindingId,
      toolName: a.toolName,
      args: a.args,
    }),
  };
}

async function postInvoke(opts: PoolClientOptions, doFetch: FetchLike, a: McpInvokeArgs): Promise<Response> {
  const poolKey = buildPoolKeyFromParts(a.agentId, a.tenantId, a.mcpBindingId);
  try {
    return await doFetch(`${opts.baseUrl}/internal/mcp/invoke`, buildRequestInit(opts, poolKey, a));
  } catch (cause) {
    if (cause instanceof McpPoolError) throw cause;
    throw new McpPoolError('transport');
  }
}

export function createMcpPoolClient(opts: PoolClientOptions): McpInvoker {
  const doFetch: FetchLike = opts.fetch ?? (async (url, init) => await fetch(url, init));
  return {
    invoke: async (a) => {
      const res = await postInvoke(opts, doFetch, a);
      return await parseResponse(res);
    },
  };
}
