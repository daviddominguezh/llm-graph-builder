import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { createServiceClient } from '../../db/queries/executionAuthQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { assertEgressForServers } from '../../lib/assertEgressForServers.js';
import { buildConnectEntryDeps, connectEntry } from '../../mcp/pool/connectEntry.js';
import type { ConnectionPool } from '../../mcp/pool/connectionPool.js';
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

interface BindingArgs {
  agentId: string;
  tenantId: string;
  mcpBindingId: string;
}

export interface PreflightDeps {
  pool: ConnectionPool;
  resolveBinding: (a: BindingArgs) => Promise<ResolvedBinding>;
  revalidateEgress: (server: McpServerConfig) => Promise<void>;
  connect: (server: McpServerConfig) => Promise<McpClientHandle>;
}

interface PreflightArgs extends BindingArgs {
  deps: PreflightDeps;
}

/**
 * WARM a pool entry ahead of use: resolve the binding server-side, re-validate
 * egress, then `borrow` (which cold-connects via `connect` and stores the handle
 * on the entry) and immediately `release` WITHOUT calling any tool. Success
 * leaves a warm, borrow-0 entry the next invoke can reuse. The `finally` release
 * pairs with a successful borrow; on a connect failure the pool self-unwinds and
 * deletes the husk, so the release is then a no-op — no leaked refcount either way.
 */
export async function preflightMcp(a: PreflightArgs): Promise<{ ok: boolean }> {
  const key = buildPoolKey({ agentId: a.agentId, tenantId: a.tenantId, mcpBindingId: a.mcpBindingId });
  try {
    const binding = await a.deps.resolveBinding(a);
    await a.deps.revalidateEgress(binding.server);
    await a.deps.pool.borrow(key, async () => await a.deps.connect(binding.server));
    return { ok: true };
  } catch {
    return { ok: false };
  } finally {
    a.deps.pool.release(key);
  }
}

const BodySchema = z.object({
  agentId: z.string().min(MIN_LEN),
  tenantId: z.string().min(MIN_LEN),
  mcpBindingId: z.string().min(MIN_LEN),
});

/**
 * Production wiring. The pool is the process singleton; org + server config are
 * derived server-side from `agentId` via `resolveBinding` (the caller never
 * supplies them). `resolveBinding` caches `orgId` into the closure so the later
 * `connect` can authenticate without a second DB round-trip — safe because each
 * request builds a fresh deps object and `preflightMcp` always resolves before connecting.
 */
function buildPreflightDeps(supabase: SupabaseClient): PreflightDeps {
  const bindingDeps = buildResolveBindingDeps(supabase);
  let orgId = '';
  return {
    pool: mcpPool,
    resolveBinding: async (a) => {
      const binding = await resolveBinding({ ...a, deps: bindingDeps });
      ({ orgId } = binding);
      return binding;
    },
    revalidateEgress: async (server) => {
      await assertEgressForServers([server]);
    },
    connect: async (server) => await connectEntry(server, buildConnectEntryDeps(supabase, orgId)),
  };
}

export async function handleMcpPreflight(req: Request, res: Response): Promise<void> {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ ok: false });
    return;
  }
  const deps = buildPreflightDeps(createServiceClient());
  const out = await preflightMcp({ ...parsed.data, deps });
  res.status(out.ok ? HTTP_OK : HTTP_BAD_REQUEST).json(out);
}
