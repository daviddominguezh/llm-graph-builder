import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { createServiceClient } from '../../db/queries/executionAuthQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { assertEgressForServers } from '../../lib/assertEgressForServers.js';
import { buildConnectEntryDeps, connectEntry } from '../../mcp/pool/connectEntry.js';
import type { ConnectionPool } from '../../mcp/pool/connectionPool.js';
import { validateOrReconnect } from '../../mcp/pool/poolEntry.js';
import { buildPoolKey } from '../../mcp/pool/poolKey.js';
import { mcpPool } from '../../mcp/pool/poolService.js';
import {
  type ResolvedBinding,
  buildResolveBindingDeps,
  resolveBinding,
} from '../../mcp/pool/resolveBinding.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const MIN_LEN = 1;

// One client call → one response. Transparent failover hides machine crashes
// EXCEPT a crash WHILE the tool call is in flight: that is the only case the
// caller is told the outcome is `uncertain_outcome`. Every failure BEFORE the
// tool's request leaves the wire (binding resolve, egress re-validate, connect
// / reconnect) is recoverable/retryable and surfaces as `binding`/`transport`.
export type InvokeOutcome =
  | { kind: 'result'; result: unknown }
  | { kind: 'tool_error'; category: 'uncertain_outcome' | 'transport' | 'binding' };

interface BindingArgs {
  agentId: string;
  tenantId: string;
  mcpBindingId: string;
}

export interface InvokeDeps {
  pool: ConnectionPool;
  resolveBinding: (a: BindingArgs) => Promise<ResolvedBinding>;
  revalidateEgress: (server: McpServerConfig) => Promise<void>;
  isHealthy: (h: McpClientHandle) => Promise<boolean>;
  connect: (binding: ResolvedBinding) => Promise<McpClientHandle>;
}

interface InvokeArgs extends BindingArgs {
  toolName: string;
  args: unknown;
  deps: InvokeDeps;
}

type Preflight = { kind: 'ok'; binding: ResolvedBinding } | { kind: 'err'; outcome: InvokeOutcome };

function toolError(category: 'uncertain_outcome' | 'transport' | 'binding'): InvokeOutcome {
  return { kind: 'tool_error', category };
}

/**
 * Resolve the binding (org + server config from the DB, never from the caller)
 * and re-validate egress against the freshly-resolved URL. Both run BEFORE any
 * bytes hit the wire, so a failure here is recoverable: `binding` for an unknown
 * binding, `transport` for an egress block — never `uncertain_outcome`.
 */
async function resolveOrNull(a: InvokeArgs): Promise<ResolvedBinding | null> {
  try {
    return await a.deps.resolveBinding(a);
  } catch {
    return null;
  }
}

async function egressOk(deps: InvokeDeps, server: McpServerConfig): Promise<boolean> {
  try {
    await deps.revalidateEgress(server);
    return true;
  } catch {
    return false;
  }
}

async function preflight(a: InvokeArgs): Promise<Preflight> {
  const binding = await resolveOrNull(a);
  if (binding === null) return { kind: 'err', outcome: toolError('binding') };
  if (!(await egressOk(a.deps, binding.server))) return { kind: 'err', outcome: toolError('transport') };
  return { kind: 'ok', binding };
}

/**
 * Borrow (refcount + cold connect) then validate the warm handle on borrow:
 * a reused transport may have died since last use, so `validateOrReconnect`
 * health-checks it and reconnects ONCE if stale. All of this is pre-execution,
 * so any failure propagates to the `transport` path — not `uncertain_outcome`.
 */
async function borrowLive(deps: InvokeDeps, binding: ResolvedBinding, key: string): Promise<McpClientHandle> {
  const connect = async (): Promise<McpClientHandle> => await deps.connect(binding);
  const handle = await deps.pool.borrow(key, connect);
  const entry = deps.pool.entries().get(key);
  if (entry === undefined) return handle;
  try {
    return await validateOrReconnect(entry, connect, deps.isHealthy);
  } catch (error) {
    // `borrow` already took the refcount to 1; the pool only self-unwinds the
    // FIRST connect, not this on-borrow reconnect. Release once so the now
    // handle-less entry nets back to 0 and eviction can reclaim it (eviction
    // permanently skips `borrows > 0`), then rethrow into the transport path.
    deps.pool.release(key);
    throw error;
  }
}

/**
 * Invoke the tool on a live handle and ALWAYS release the borrow. A throw here
 * means the request was already sent: we cannot tell whether the server ran the
 * tool, so we never retry — we surface `uncertain_outcome` to the caller.
 */
async function callAndRelease(a: InvokeArgs, key: string, h: McpClientHandle): Promise<InvokeOutcome> {
  try {
    return { kind: 'result', result: await h.callTool(a.toolName, a.args) };
  } catch {
    return toolError('uncertain_outcome');
  } finally {
    a.deps.pool.release(key);
  }
}

/**
 * Borrow a live handle, returning null on any pre-execution connect/reconnect
 * failure. A null here is a transparent transport failure (the tool never ran),
 * safe to retry from the caller — never an uncertain outcome.
 */
async function borrowOrNull(
  deps: InvokeDeps,
  binding: ResolvedBinding,
  key: string
): Promise<McpClientHandle | null> {
  try {
    return await borrowLive(deps, binding, key);
  } catch {
    return null;
  }
}

export async function invokeMcp(a: InvokeArgs): Promise<InvokeOutcome> {
  const pre = await preflight(a);
  if (pre.kind === 'err') return pre.outcome;
  const key = buildPoolKey({ agentId: a.agentId, tenantId: a.tenantId, mcpBindingId: a.mcpBindingId });
  const handle = await borrowOrNull(a.deps, pre.binding, key);
  if (handle === null) return toolError('transport');
  return await callAndRelease(a, key, handle);
}

const BodySchema = z.object({
  agentId: z.string().min(MIN_LEN),
  tenantId: z.string().min(MIN_LEN),
  mcpBindingId: z.string().min(MIN_LEN),
  toolName: z.string().min(MIN_LEN),
  args: z.unknown(),
});

/**
 * Production wiring. The pool is the process singleton; the org + server config
 * are derived server-side from `agentId` via `resolveBinding` (the caller never
 * supplies them). `isHealthy` trusts warm handles — liveness is maintained out
 * of band by keepalive — so on-borrow reconnect only fires for a closed handle.
 */
function buildInvokeDeps(supabase: SupabaseClient): InvokeDeps {
  const bindingDeps = buildResolveBindingDeps(supabase);
  return {
    pool: mcpPool,
    resolveBinding: async (a) => await resolveBinding({ ...a, deps: bindingDeps }),
    revalidateEgress: async (server) => {
      await assertEgressForServers([server]);
    },
    isHealthy: async () => await Promise.resolve(true),
    connect: async (binding) =>
      await connectEntry(binding.server, buildConnectEntryDeps(supabase, binding.orgId)),
  };
}

function statusFor(outcome: InvokeOutcome): number {
  if (outcome.kind === 'tool_error' && outcome.category === 'binding') return HTTP_BAD_REQUEST;
  return HTTP_OK;
}

export async function handleMcpInvoke(req: Request, res: Response): Promise<void> {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json(toolError('binding'));
    return;
  }
  const deps = buildInvokeDeps(createServiceClient());
  const outcome = await invokeMcp({ ...parsed.data, deps });
  res.status(statusFor(outcome)).json(outcome);
}
