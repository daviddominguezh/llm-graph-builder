import type { SupabaseClient } from '../../../db/queries/operationHelpers.js';
import {
  decryptInstagramToken,
  getChannelConnection,
  getInstagramCredential,
} from '../../queries/channelQueries.js';
import { REDIS_KEYS, buildRedisKey } from '../../types/redisKeys.js';
import { getCachedCredential, setCachedCredential } from '../credentialCache.js';

export interface InstagramSendCredentials {
  accessToken: string;
  igUserId: string;
}

function buildCacheKey(agentId: string, tenantId: string): string {
  return buildRedisKey(REDIS_KEYS.CREDENTIAL_CACHE_IG, `${agentId}:${tenantId}`);
}

function isInstagramCredentials(value: unknown): value is InstagramSendCredentials {
  if (value === null || typeof value !== 'object') return false;
  return 'accessToken' in value && 'igUserId' in value;
}

async function fetchFromDb(
  supabase: SupabaseClient,
  agentId: string,
  tenantId: string
): Promise<InstagramSendCredentials> {
  const connection = await getChannelConnection(supabase, agentId, tenantId, 'instagram');
  if (connection === null) {
    throw new Error('No Instagram channel connection found');
  }

  const credential = await getInstagramCredential(supabase, connection.id);
  if (credential === null) {
    throw new Error('No Instagram credentials found');
  }

  const accessToken = await decryptInstagramToken(supabase, credential.id);
  return { accessToken, igUserId: credential.ig_user_id };
}

export async function resolveInstagramCredentials(
  supabase: SupabaseClient,
  agentId: string,
  tenantId: string
): Promise<InstagramSendCredentials> {
  const cacheKey = buildCacheKey(agentId, tenantId);

  // Tier 1 + 2: in-memory -> Redis
  const cached = await getCachedCredential(cacheKey);
  if (isInstagramCredentials(cached)) return cached;

  // Tier 3: DB
  const credentials = await fetchFromDb(supabase, agentId, tenantId);
  await setCachedCredential(cacheKey, credentials);
  return credentials;
}
