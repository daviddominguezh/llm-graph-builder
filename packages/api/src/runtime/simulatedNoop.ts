import type { ProviderCtx } from '../providers/provider.js';

/**
 * The shared no-op every built-in tool returns while executing under the
 * `simulation` environment. It performs no external side effects and yields a
 * stable `{ simulated: true }` marker so callers (and tests) can detect that a
 * tool short-circuited instead of hitting a real service. The per-builtin guard
 * that routes to this function is wired in a later task; this module only
 * provides the seam.
 */
export async function simulatedNoop(_args: unknown, _ctx: ProviderCtx): Promise<{ simulated: true }> {
  return await Promise.resolve({ simulated: true });
}
