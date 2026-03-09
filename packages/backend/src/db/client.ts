import { createClient } from '@supabase/supabase-js';

function getEnvValue(name: string): string | undefined {
  return process.env[name];
}

function getRequiredEnv(name: string): string {
  const value = getEnvValue(name);
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Creates a Supabase client authenticated as the requesting user.
 * The JWT is forwarded from the Next.js proxy so that
 * Row-Level Security policies apply automatically.
 */
export function createSupabaseClient(jwt: string): ReturnType<typeof createClient> {
  const url = getRequiredEnv('SUPABASE_URL');
  const anonKey = getRequiredEnv('SUPABASE_ANON_KEY');

  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
    },
  });
}
