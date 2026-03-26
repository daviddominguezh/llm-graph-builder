import { updateProductionKeyId, updateStagingKeyId } from '../../db/queries/agentQueries.js';
import {
  type ApiKeyRow,
  createApiKey as createApiKeyQuery,
  deleteApiKey as deleteApiKeyQuery,
  getApiKeysByOrg,
} from '../../db/queries/apiKeyQueries.js';
import type { ServiceContext } from '../types.js';

export async function listApiKeys(ctx: ServiceContext): Promise<ApiKeyRow[]> {
  const { result, error } = await getApiKeysByOrg(ctx.supabase, ctx.orgId);
  if (error !== null) throw new Error(error);
  return result;
}

export async function createApiKey(ctx: ServiceContext, name: string, keyValue: string): Promise<ApiKeyRow> {
  const { result, error } = await createApiKeyQuery(ctx.supabase, ctx.orgId, name, keyValue);
  if (error !== null || result === null) throw new Error(error ?? 'Failed to create API key');
  return result;
}

export async function deleteApiKey(ctx: ServiceContext, keyId: string): Promise<void> {
  const { error } = await deleteApiKeyQuery(ctx.supabase, keyId);
  if (error !== null) throw new Error(error);
}

export async function setStagingKey(
  ctx: ServiceContext,
  agentId: string,
  keyId: string | null
): Promise<void> {
  const { error } = await updateStagingKeyId(ctx.supabase, agentId, keyId);
  if (error !== null) throw new Error(error);
}

export async function setProductionKey(
  ctx: ServiceContext,
  agentId: string,
  keyId: string | null
): Promise<void> {
  const { error } = await updateProductionKeyId(ctx.supabase, agentId, keyId);
  if (error !== null) throw new Error(error);
}
