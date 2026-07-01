import type { ResolveChildInput, ResolvedChildConfig, SupabaseLike } from '../capabilities/index.js';

export type BackendResolve = (
  supabase: SupabaseLike,
  input: ResolveChildInput
) => Promise<ResolvedChildConfig>;

export function makeResolveChildConfig(
  supabase: SupabaseLike,
  backendResolve: BackendResolve
): (input: ResolveChildInput) => Promise<ResolvedChildConfig> {
  return async (input: ResolveChildInput): Promise<ResolvedChildConfig> =>
    await backendResolve(supabase, input);
}
