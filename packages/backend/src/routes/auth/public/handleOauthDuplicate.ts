import type { SupabaseClient } from '@supabase/supabase-js';
import express, { type Request, type Response } from 'express';
import { createHmac } from 'node:crypto';

import { serviceSupabase } from '../../../db/client.js';
import { auditLog } from '../../../lib/auditLog.js';
import { createRateLimiter } from '../../../lib/rateLimiter.js';

const IP_MAX = 20;
const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;
const IP_WINDOW_MS = MINUTES_PER_HOUR * MS_PER_MINUTE;
const EMAIL_MAX = 5;
const HOURS_PER_DAY = 24;
const EMAIL_WINDOW_MS = HOURS_PER_DAY * MINUTES_PER_HOUR * MS_PER_MINUTE;

const HTTP_RATE_LIMITED = 429;
const HTTP_INTERNAL = 500;

const ipLimiter = createRateLimiter({ max: IP_MAX, windowMs: IP_WINDOW_MS });
const emailLimiter = createRateLimiter({ max: EMAIL_MAX, windowMs: EMAIL_WINDOW_MS });

function hashEmail(email: string): string {
  const secret = process.env.RATE_LIMIT_BUCKET_SECRET ?? '';
  return createHmac('sha256', secret).update(email.toLowerCase()).digest('base64url');
}

interface DuplicateResult {
  duplicate: boolean;
  email?: string;
}

interface RpcResponse {
  data: DuplicateResult | null;
  error: { message: string } | null;
}

function isDuplicateResult(value: unknown): value is DuplicateResult {
  if (typeof value !== 'object' || value === null) return false;
  return 'duplicate' in value;
}

function getUserId(res: Response): string {
  const v: unknown = res.locals.userId;
  if (typeof v !== 'string') throw new Error('userId missing from locals');
  return v;
}

async function handleEmailRateLimit(
  result: DuplicateResult,
  userId: string,
  ip: string,
  res: Response
): Promise<boolean> {
  if (!result.duplicate) {
    return false;
  }
  if (result.email !== undefined && !emailLimiter.consume(hashEmail(result.email))) {
    res.status(HTTP_RATE_LIMITED).json({ error: 'rate_limited' });
    return true;
  }
  await auditLog({ event: 'oauth_duplicate_rejected', userId, email: result.email, ip });
  return false;
}

async function handleOauthDuplicate(req: Request, res: Response): Promise<void> {
  const userId = getUserId(res);
  const ip = req.ip ?? 'unknown';

  if (!ipLimiter.consume(ip)) {
    res.status(HTTP_RATE_LIMITED).json({ error: 'rate_limited' });
    return;
  }

  const supabase: SupabaseClient = serviceSupabase();
  const { data, error } = (await supabase.rpc('reject_oauth_duplicate', { p_uid: userId })) as RpcResponse;

  if (error !== null) {
    res.status(HTTP_INTERNAL).json({ error: 'duplicate_check_failed' });
    return;
  }

  const rawData: unknown = data ?? {};
  const result: DuplicateResult = isDuplicateResult(rawData) ? rawData : { duplicate: false };
  const rateLimited = await handleEmailRateLimit(result, userId, ip, res);

  if (!rateLimited) {
    res.json(result);
  }
}

export function handleOauthDuplicateRouter(): express.Router {
  const router = express.Router();
  router.post('/handle-oauth-duplicate', handleOauthDuplicate);
  return router;
}
