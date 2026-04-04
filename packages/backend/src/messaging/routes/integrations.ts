/**
 * WhatsApp Business integration routes.
 *
 * POST  /projects/:tenantId/integrations/whatsapp       — connect
 * DELETE /projects/:tenantId/integrations/whatsapp/:connectionId — disconnect
 */
import express from 'express';
import type { Request } from 'express';

import { invalidateCredentialCache } from '../services/credentialCache.js';
import { REDIS_KEYS, buildRedisKey } from '../types/redisKeys.js';
import {
  deleteWhatsAppConnection,
  getOrgIdFromTenant,
  insertChannelConnection,
  insertWhatsAppCredentials,
  isPhoneAlreadyRegistered,
  parseIntegrationBody,
  performMetaOnboarding,
} from './integrationHelpers.js';
import type { IntegrationResult } from './integrationHelpers.js';
import type { MessagingResponse } from './routeHelpers.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL,
  HTTP_OK,
  extractErrorMessage,
  getRequiredParam,
  getSupabase,
} from './routeHelpers.js';

/* ─── Error classifier ─── */

function classifyError(err: Error): { status: number; code: string; message: string } | null {
  if (err.message.includes('access token')) {
    return { status: HTTP_BAD_REQUEST, code: 'auth_failed', message: 'Failed to authenticate with Meta.' };
  }
  if (err.message.includes('registering phone') || err.message.includes('Cloud API')) {
    return {
      status: HTTP_BAD_REQUEST,
      code: 'phone_registration_failed',
      message: 'Phone registration failed.',
    };
  }
  if (err.message.includes('webhook') || err.message.includes('Webhook')) {
    return { status: HTTP_BAD_REQUEST, code: 'webhook_failed', message: 'Webhook registration failed.' };
  }
  return null;
}

/* ─── POST: connect WhatsApp ─── */

async function handleConnect(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = getRequiredParam(req, 'tenantId');
    const body = parseIntegrationBody(req.body);

    if (body === null) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Missing required fields' });
      return;
    }

    const duplicate = await isPhoneAlreadyRegistered(supabase, body.phoneNumberId);
    if (duplicate) {
      res
        .status(HTTP_BAD_REQUEST)
        .json({ error: 'Phone already registered', code: 'phone_already_registered' });
      return;
    }

    const result = await executeOnboarding(supabase, tenantId, body);
    res.status(HTTP_OK).json({ success: true, data: result });
  } catch (err) {
    respondWithError(err, res);
  }
}

async function executeOnboarding(
  supabase: ReturnType<typeof getSupabase>,
  tenantId: string,
  body: ReturnType<typeof parseIntegrationBody> & object
): Promise<IntegrationResult> {
  const parsedBody = body as NonNullable<ReturnType<typeof parseIntegrationBody>>;

  const { accessToken, isOnApp } = await performMetaOnboarding(parsedBody);
  const orgId = await getOrgIdFromTenant(supabase, tenantId);
  const connectionId = await insertChannelConnection(supabase, orgId, parsedBody, tenantId);
  await insertWhatsAppCredentials(supabase, connectionId, accessToken, parsedBody);

  return { phone: parsedBody.phone, isOnApp };
}

/* ─── DELETE: disconnect WhatsApp ─── */

async function handleDisconnect(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const connectionId = getRequiredParam(req, 'connectionId');
    const tenantId = getRequiredParam(req, 'tenantId');

    await deleteWhatsAppConnection(supabase, connectionId);
    await invalidateCacheForConnection(tenantId, connectionId);

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

async function invalidateCacheForConnection(tenantId: string, connectionId: string): Promise<void> {
  const cacheKey = buildRedisKey(REDIS_KEYS.CREDENTIAL_CACHE_WA, `*:${tenantId}`);
  await invalidateCredentialCache(cacheKey);
}

/* ─── Error response helper ─── */

function respondWithError(err: unknown, res: MessagingResponse): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const classified = classifyError(error);

  if (classified !== null) {
    res.status(classified.status).json({ error: classified.message, code: classified.code });
    return;
  }

  res.status(HTTP_INTERNAL).json({ error: 'Failed to add WhatsApp integration' });
}

/* ─── Router ─── */

export const integrationsRouter = express.Router({ mergeParams: true });
integrationsRouter.post('/whatsapp', handleConnect);
integrationsRouter.delete('/whatsapp/:connectionId', handleDisconnect);
