import { type SupabaseClient, createClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Service-role Supabase client, for Next.js-backend-only lookups    */
/*  that bypass RLS. Never importable from client components.         */
/*                                                                      */
/*  Used by the widget chat proxy to resolve the per-agent widget     */
/*  execution key (encrypted at rest in agent_execution_keys) without */
/*  ever sending it to the browser.                                   */
/* ------------------------------------------------------------------ */

function readEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function createServiceRoleClient(): SupabaseClient {
  const url = readEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}
