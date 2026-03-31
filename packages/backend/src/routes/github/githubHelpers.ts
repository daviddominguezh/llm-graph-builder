import { createClient } from '@supabase/supabase-js';
import { env } from 'node:process';

type SupabaseClient = ReturnType<typeof createClient>;

export function createServiceClient(): SupabaseClient {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;
  if (SUPABASE_URL === undefined || SUPABASE_SERVICE_ROLE_KEY === undefined) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export function logGitHub(handler: string, message: string): void {
  process.stdout.write(`[github/${handler}] ${message}\n`);
}

export function logGitHubError(handler: string, message: string): void {
  process.stderr.write(`[github/${handler}] ERROR: ${message}\n`);
}

export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}
