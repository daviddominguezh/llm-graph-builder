import type { SupabaseClient, User, UserIdentity } from '@supabase/supabase-js';
import express, { type Request, type Response } from 'express';

import { serviceSupabase } from '../../db/client.js';
import { auditLog } from '../../lib/auditLog.js';
import { requireGateComplete } from '../../middleware/gates.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL = 500;

interface DeleteResult {
  error: unknown;
}

interface DeleteEqFinal {
  eq: (col: string, val: string) => Promise<DeleteResult>;
}

interface DeleteEqChain {
  eq: (col: string, val: string) => DeleteEqFinal;
}

interface IdentitiesTable {
  delete: () => DeleteEqChain;
}

interface AuthSchemaClient {
  from: (table: 'identities') => IdentitiesTable;
}

interface SchemaCapableClient {
  schema: (name: 'auth') => AuthSchemaClient;
}

interface GetUserResult {
  data: { user: User };
  error: null;
}

interface GetUserErrorResult {
  data: { user: null };
  error: { message: string };
}

type GetUserResponse = GetUserResult | GetUserErrorResult;

function getUserId(res: Response): string {
  const v: unknown = res.locals.userId;
  if (typeof v !== 'string') throw new Error('userId missing from locals');
  return v;
}

function isSchemaCapable(v: unknown): v is SchemaCapableClient {
  return v !== null && typeof v === 'object' && 'schema' in v;
}

function requireSchemaCapable(client: SupabaseClient): SchemaCapableClient {
  if (!isSchemaCapable(client)) throw new Error('service client does not support schema()');
  return client;
}

function isGetUserResult(r: GetUserResponse): r is GetUserResult {
  return r.error === null;
}

function findIdentityByProvider(identities: UserIdentity[], provider: string): UserIdentity | undefined {
  return identities.find((id) => id.provider === provider);
}

async function fetchUser(service: SupabaseClient, userId: string): Promise<GetUserResponse> {
  return (await service.auth.admin.getUserById(userId)) as GetUserResponse;
}

async function deleteGoogleIdentity(service: SupabaseClient, userId: string): Promise<DeleteResult> {
  const capable = requireSchemaCapable(service);
  const table = capable.schema('auth').from('identities');
  return await table.delete().eq('user_id', userId).eq('provider', 'google');
}

async function unlinkGoogle(req: Request, res: Response): Promise<void> {
  const userId = getUserId(res);
  const service = serviceSupabase();
  const result = await fetchUser(service, userId);

  if (!isGetUserResult(result)) {
    res.status(HTTP_INTERNAL).json({ error: 'unlink_failed' });
    return;
  }

  const identities = result.data.user.identities ?? [];
  const googleIdentity = findIdentityByProvider(identities, 'google');

  if (googleIdentity === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'no_google_identity' });
    return;
  }

  const emailIdentity = findIdentityByProvider(identities, 'email');

  if (emailIdentity === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'cannot_unlink_only_identity' });
    return;
  }

  const deleteResult = await deleteGoogleIdentity(service, userId);

  if (deleteResult.error !== null && deleteResult.error !== undefined) {
    res.status(HTTP_INTERNAL).json({ error: 'unlink_failed' });
    return;
  }

  await auditLog({ event: 'google_unlinked', userId });
  res.status(HTTP_OK).json({ ok: true });
}

export function unlinkGoogleRouter(): express.Router {
  const router = express.Router();
  router.post('/unlink-google', requireGateComplete, unlinkGoogle);
  return router;
}
