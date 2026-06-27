import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';

import type { ConnectionPool } from '../mcp/pool/connectionPool.js';
import { buildPoolKey } from '../mcp/pool/poolKey.js';

/**
 * Tool-invocation arguments for the in-process simulation invoker. Structurally
 * identical to the api `McpInvokeArgs` (which is not re-exported from the
 * `@daviddh/llm-graph-runner` package root), so a `SimMcpInvoker` is assignable
 * to `buildMcpProvider`'s `mcpPool` seam once the registry threading lands. See
 * the Task-12 report for the remaining (cross-package) wiring.
 */
export interface SimMcpInvokeArgs {
  agentId: string;
  tenantId: string;
  mcpBindingId: string;
  toolName: string;
  args: unknown;
}

export interface SimMcpInvoker {
  invoke: (a: SimMcpInvokeArgs) => Promise<unknown>;
}

export interface SimInvokerArgs {
  pool: ConnectionPool;
  servers: McpServerConfig[];
  orgId: string;
  connect: (server: McpServerConfig) => Promise<McpClientHandle>;
  revalidateEgress: (server: McpServerConfig) => Promise<void>;
}

function resolveServer(args: SimInvokerArgs, mcpBindingId: string): McpServerConfig {
  const server = args.servers.find((s) => s.id === mcpBindingId);
  if (server === undefined) throw new Error('binding not found');
  return server;
}

/**
 * Borrow a warm handle for the sim's `(agentId, tenantId, binding)` poolKey,
 * (lazily connecting via `connect` on first use), run the tool call, then
 * release the refcount. Egress is re-validated per borrow — replacing the
 * connect-time guard that the retired `createMcpSession` bypass used to apply.
 */
async function invokeThroughPool(args: SimInvokerArgs, a: SimMcpInvokeArgs): Promise<unknown> {
  const server = resolveServer(args, a.mcpBindingId);
  await args.revalidateEgress(server);
  const key = buildPoolKey({
    agentId: a.agentId,
    tenantId: a.tenantId,
    mcpBindingId: a.mcpBindingId,
  });
  const handle = await args.pool.borrow(key, async () => await args.connect(server));
  try {
    return await handle.callTool(a.toolName, a.args);
  } finally {
    args.pool.release(key);
  }
}

/**
 * Adapt the in-process connection pool into an `McpInvoker`-shaped object so the
 * simulation's MCP tool execution borrows a warm connection from the pool
 * instead of opening a fresh direct-connect `createMcpSession`. In sim there is
 * no Fly routing — the pool runs locally in the same process.
 */
export function buildSimulationMcpInvoker(args: SimInvokerArgs): SimMcpInvoker {
  return {
    invoke: async (a) => await invokeThroughPool(args, a),
  };
}
