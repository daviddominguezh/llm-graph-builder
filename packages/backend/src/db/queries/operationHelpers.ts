import type { SupabaseClient as BaseSupabaseClient } from '@supabase/supabase-js';

export type SupabaseClient = BaseSupabaseClient;

interface MutationResult {
  error: { message: string } | null;
}

export function throwOnMutationError(result: MutationResult, label: string): void {
  if (result.error !== null) {
    throw new Error(`${label}: ${result.error.message}`);
  }
}
