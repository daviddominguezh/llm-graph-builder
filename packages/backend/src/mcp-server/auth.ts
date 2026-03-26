import {
  createServiceClient,
  updateKeyLastUsed,
  validateExecutionKey,
} from '../db/queries/executionAuthQueries.js';
import { hashToken } from '../utils/hashToken.js';
import type { ServiceContext } from './types.js';

const BEARER_PREFIX = 'Bearer ';

export async function authenticateMcpKey(authorization: string | undefined): Promise<ServiceContext> {
  if (authorization?.startsWith(BEARER_PREFIX) !== true) {
    throw new Error('Missing or malformed Authorization header');
  }

  const token = authorization.slice(BEARER_PREFIX.length);
  const supabase = createServiceClient();
  const keyHash = hashToken(token);
  const result = await validateExecutionKey(supabase, keyHash);

  if (result === null) {
    throw new Error('Invalid or expired execution key');
  }

  void updateKeyLastUsed(supabase, result.id);

  return { supabase, orgId: result.orgId, keyId: result.id };
}
