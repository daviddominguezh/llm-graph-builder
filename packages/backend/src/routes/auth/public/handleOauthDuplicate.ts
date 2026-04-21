import { createHmac } from 'node:crypto';

import express, { type Request, type Response } from 'express';

import { serviceSupabase } from '../../../db/client.js';
import { auditLog } from '../../../lib/auditLog.js';
import { createRateLimiter } from '../../../lib/rateLimiter.js';

const IP_MAX = 20;
const IP_WINDOW_MS = 60 * 60_000;
const EMAIL_MAX = 5;
const EMAIL_WINDOW_MS = 24 * 60 * 60_000;

const HTTP_RATE_LIMITED = 429;
const HTTP_INTERNAL = 500;

const ipLimiter = createRateLimiter({ max: IP_MAX, windowMs: IP_WINDOW_MS });
const emailLimiter = createRateLimiter({ max: EMAIL_MAX, windowMs: EMAIL_WINDOW_MS });

function hashEmail(email: string): string {
  const secret = process.env['RATE_LIMIT_BUCKET_SECRET'] ?? '';
  return createHmac('sha256', secret).update(email.toLowerCase()).digest('base64url');
}

interface DuplicateResult {
  duplicate: boolean;
  email?: string;
}

async function handleEmailRateLimit(
  result: DuplicateResult,
  userId: string,
  ip: string,
  res: Response,
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
  const userId = res.locals['userId'] as string;
  const ip = req.ip ?? 'unknown';

  if (!ipLimiter.consume(ip)) {
    res.status(HTTP_RATE_LIMITED).json({ error: 'rate_limited' });
    return;
  }

  const supabase = serviceSupabase();
  const rpcArgs = { p_uid: userId } as unknown as undefined;
  const { data, error } = (await supabase.rpc('reject_oauth_duplicate', rpcArgs)) as {
    data: DuplicateResult | null;
    error: { message: string } | null;
  };

  if (error !== null) {
    res.status(HTTP_INTERNAL).json({ error: 'duplicate_check_failed' });
    return;
  }

  const result = (data ?? {}) as DuplicateResult;
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
