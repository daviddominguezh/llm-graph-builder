import { createHmac } from 'node:crypto';

import express, { type Request, type Response } from 'express';
import { z } from 'zod';

import { auditLog } from '../../../lib/auditLog.js';
import { createRateLimiter } from '../../../lib/rateLimiter.js';
import { serviceSupabase } from '../../../db/client.js';

const BodySchema = z.object({ email: z.string().email() });

const IP_LIMIT_MAX = 20;
const IP_LIMIT_WINDOW_MS = 60_000;
const EMAIL_LIMIT_MAX = 5;
const EMAIL_LIMIT_WINDOW_MS = 60 * 60_000;

const HTTP_BAD_REQUEST = 400;
const HTTP_RATE_LIMITED = 429;
const HTTP_INTERNAL = 500;

const ipLimiter = createRateLimiter({ max: IP_LIMIT_MAX, windowMs: IP_LIMIT_WINDOW_MS });
const emailLimiter = createRateLimiter({ max: EMAIL_LIMIT_MAX, windowMs: EMAIL_LIMIT_WINDOW_MS });

function hashEmail(email: string): string {
  const secret = process.env['RATE_LIMIT_BUCKET_SECRET'] ?? '';
  return createHmac('sha256', secret).update(email.toLowerCase()).digest('base64url');
}

function isRateLimited(ip: string, emailKey: string): boolean {
  return !ipLimiter.consume(ip) || !emailLimiter.consume(emailKey);
}

async function handleRateLimited(req: Request, res: Response, email: string, ip: string): Promise<void> {
  await auditLog({ event: 'lookup_rate_limited', email, ip, userAgent: req.get('user-agent') ?? undefined });
  res.status(HTTP_RATE_LIMITED).json({ error: 'rate_limited' });
}

async function handleLookupEmail(req: Request, res: Response): Promise<void> {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'invalid_email' });
    return;
  }
  const email = parsed.data.email;
  const ip = req.ip ?? 'unknown';
  const emailKey = hashEmail(email);
  if (isRateLimited(ip, emailKey)) {
    await handleRateLimited(req, res, email, ip);
    return;
  }
  const supabase = serviceSupabase();
  const rpcArgs = { p_email: email } as unknown as undefined;
  const { data, error } = (await supabase.rpc('list_user_providers', rpcArgs)) as {
    data: string[] | null;
    error: { message: string } | null;
  };
  if (error !== null) {
    res.status(HTTP_INTERNAL).json({ error: 'lookup_failed' });
    return;
  }
  const providers = (data ?? []) as string[];
  await auditLog({ event: 'lookup_email', email, ip });
  res.json({ exists: providers.length > 0, providers });
}

export function lookupEmailRouter(): express.Router {
  const router = express.Router();
  router.post('/lookup-email', handleLookupEmail);
  return router;
}
