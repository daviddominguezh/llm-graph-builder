import { Redis } from '@upstash/redis';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface VfsSession {
  session_key: string;
}

function authenticate(req: Request): boolean {
  const masterKey = Deno.env.get('EDGE_FUNCTION_MASTER_KEY');
  return req.headers.get('x-master-key') === masterKey;
}

function buildSupabaseClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(url, key);
}

function buildRedisClient(): Redis {
  return new Redis({
    url: Deno.env.get('UPSTASH_REDIS_REST_URL') ?? '',
    token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN') ?? '',
  });
}

async function listStorageObjects(
  supabase: SupabaseClient,
  prefix: string
): Promise<string[]> {
  const paths: string[] = [];
  const { data, error } = await supabase.storage.from('vfs').list(prefix, { limit: 1000 });
  if (error != null || data == null) return [];
  for (const item of data) {
    const fullPath = `${prefix}/${item.name}`;
    if (item.id == null) {
      // Pseudo-folder — recurse into it
      const nested = await listStorageObjects(supabase, fullPath);
      paths.push(...nested);
    } else {
      paths.push(fullPath);
    }
  }
  return paths;
}

async function deleteStorageObjects(supabase: SupabaseClient, session: VfsSession): Promise<void> {
  const paths = await listStorageObjects(supabase, session.session_key);
  if (paths.length > 0) {
    await supabase.storage.from('vfs').remove(paths);
  }
}

async function deleteRedisKeys(redis: Redis, sessionKey: string): Promise<void> {
  await redis.del(`vfs:dirty:${sessionKey}`);
}

async function deleteDbRow(supabase: SupabaseClient, sessionKey: string): Promise<void> {
  await supabase.from('vfs_sessions').delete().eq('session_key', sessionKey);
}

async function cleanupSession(
  supabase: SupabaseClient,
  redis: Redis,
  session: VfsSession
): Promise<void> {
  await deleteStorageObjects(supabase, session);
  await deleteRedisKeys(redis, session.session_key);
  await deleteDbRow(supabase, session.session_key);
}

async function fetchStaleSessions(supabase: SupabaseClient): Promise<VfsSession[]> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('vfs_sessions')
    .select('session_key')
    .lt('last_accessed_at', cutoff);

  if (error != null || data == null) return [];
  return data as VfsSession[];
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (!authenticate(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = buildSupabaseClient();
  const redis = buildRedisClient();

  const sessions = await fetchStaleSessions(supabase);

  for (const session of sessions) {
    await cleanupSession(supabase, redis, session);
  }

  return new Response(JSON.stringify({ cleaned: sessions.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
