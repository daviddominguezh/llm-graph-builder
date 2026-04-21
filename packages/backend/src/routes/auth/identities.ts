import type { SupabaseClient } from '@supabase/supabase-js';
import express, { type Request, type Response } from 'express';

import { serviceSupabase } from '../../db/client.js';

const HTTP_OK = 200;
const HTTP_INTERNAL = 500;

interface SafeIdentity {
  provider: string;
  email: string;
  created_at: string;
}

interface RpcResponse {
  data: SafeIdentity[] | null;
  error: { message: string } | null;
}

function getUserId(res: Response): string {
  const v: unknown = res.locals.userId;
  if (typeof v !== 'string') throw new Error('userId missing from locals');
  return v;
}

async function handleGetIdentities(req: Request, res: Response): Promise<void> {
  const userId = getUserId(res);
  const supabase: SupabaseClient = serviceSupabase();
  const { data, error } = (await supabase.rpc('get_safe_identities', { p_user_id: userId })) as RpcResponse;

  if (error !== null) {
    res.status(HTTP_INTERNAL).json({ error: 'identities_failed' });
    return;
  }

  res.status(HTTP_OK).json({ identities: data ?? [] });
}

export function identitiesRouter(): express.Router {
  const router = express.Router();
  router.get('/identities', handleGetIdentities);
  return router;
}
