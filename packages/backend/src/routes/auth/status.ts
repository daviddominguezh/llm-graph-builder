import type { SupabaseClient } from '@supabase/supabase-js';
import express, { type Request, type Response } from 'express';

const HTTP_OK = 200;
const HTTP_INTERNAL = 500;

interface UserRow {
  onboarding_completed_at: string | null;
  grandfathered_at: string | null;
}

interface UserRowResult {
  data: UserRow | null;
  error: { message: string } | null;
}

interface StatusFlags {
  phone_verified: boolean;
  onboarding_completed: boolean;
}

function isSupabaseClient(v: unknown): v is SupabaseClient {
  return v !== null && typeof v === 'object' && 'auth' in v && 'from' in v;
}

function getSupabase(res: Response): SupabaseClient {
  const v: unknown = res.locals.supabase;
  if (!isSupabaseClient(v)) throw new Error('supabase missing');
  return v;
}

function getUserId(res: Response): string {
  const v: unknown = res.locals.userId;
  if (typeof v !== 'string') throw new Error('userId missing');
  return v;
}

async function fetchUserRow(supabase: SupabaseClient, userId: string): Promise<UserRowResult> {
  return (await supabase
    .from('users')
    .select('onboarding_completed_at, grandfathered_at')
    .eq('id', userId)
    .single()) as UserRowResult;
}

function computeFlags(row: UserRow, phoneConfirmedAt: string | null): StatusFlags {
  return {
    phone_verified: phoneConfirmedAt !== null || row.grandfathered_at !== null,
    onboarding_completed: row.onboarding_completed_at !== null,
  };
}

async function handleGetStatus(req: Request, res: Response): Promise<void> {
  const userId = getUserId(res);
  const supabase = getSupabase(res);

  const [rowResult, authResult] = await Promise.all([
    fetchUserRow(supabase, userId),
    supabase.auth.getUser(),
  ]);

  if (rowResult.error !== null || rowResult.data === null) {
    res.status(HTTP_INTERNAL).json({ error: 'status_failed' });
    return;
  }

  if (authResult.error !== null) {
    res.status(HTTP_INTERNAL).json({ error: 'status_failed' });
    return;
  }

  const phoneConfirmedAt = authResult.data.user.phone_confirmed_at ?? null;
  const flags = computeFlags(rowResult.data, phoneConfirmedAt);
  res.status(HTTP_OK).json(flags);
}

export function statusRouter(): express.Router {
  const router = express.Router();
  router.get('/status', handleGetStatus);
  return router;
}
