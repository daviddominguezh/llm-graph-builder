import {
  consoleLogger,
  consoleObservability,
  makeResolveChildConfig,
  noopPersistence,
  noopRateLimit,
  syncRecurseStrategy,
  type McpInvoker,
  type ResolveChildInput,
  type ResolvedChildConfig,
  type RuntimeCapabilities,
  type RuntimeServices,
  type SupabaseLike,
} from '@daviddh/llm-graph-runner';

import { createServiceClient } from '../db/queries/executionAuthQueries.js';
import { resolveChildConfig } from '../routes/simulateChildResolver.js';

/**
 * Assemble the simulation `RuntimeCapabilities` for `executeTurn` (wired by
 * Task 18): the sim strategy runs children INLINE (`syncRecurseStrategy`),
 * persistence is a no-op (nothing durable in sim), and observability/logging use
 * the console caps with a no-op rate limiter.
 */
export function buildSimulationCapabilities(): RuntimeCapabilities {
  return {
    persistence: noopPersistence,
    dispatch: syncRecurseStrategy,
    observability: consoleObservability,
    rateLimit: noopRateLimit,
    logger: consoleLogger,
  };
}

/**
 * Assemble the simulation `RuntimeServices`. `mcpPool` is the REAL in-process
 * MCP invoker (RU2's `buildSimulationMcpInvoker`) — simulation performs real MCP
 * side effects, so this is not a noop. `resolveChildConfig` adapts the runner's
 * `ResolveChildInput` onto the backend's real published-graph resolver.
 */
export function buildSimulationRuntimeServices(
  supabase: SupabaseLike,
  mcpPool: McpInvoker
): RuntimeServices {
  return {
    mcpPool,
    supabase,
    resolveChildConfig: makeResolveChildConfig(supabase, resolveViaBackend),
  };
}

/**
 * Adapt the runner's `ResolveChildInput` onto the backend's real resolver. The
 * carried `SupabaseLike` is opaque (Record) and cannot be narrowed to the
 * concrete `SupabaseClient` the resolver needs without an unsafe assertion, so —
 * exactly like today's `simulateHandler.emitChildDispatched` — child config is
 * fetched with a fresh service-role client (published graph_data, org-scoped by
 * the explicit `orgId` filter inside `resolveChildConfig`).
 */
async function resolveViaBackend(
  _supabase: SupabaseLike,
  input: ResolveChildInput
): Promise<ResolvedChildConfig> {
  return await resolveChildConfig({
    supabase: createServiceClient(),
    dispatchType: input.dispatchType,
    params: input.params,
    orgId: input.orgId,
  });
}
