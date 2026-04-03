import type { SupabaseClient } from '../../../db/queries/operationHelpers.js';
import {
  decryptInstagramToken,
  getChannelConnection,
  getInstagramCredential,
} from '../../queries/channelQueries.js';

export interface InstagramSendCredentials {
  accessToken: string;
  igUserId: string;
}

export async function resolveInstagramCredentials(
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
