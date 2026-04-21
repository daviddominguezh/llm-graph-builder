import type { SupabaseClient } from '@supabase/supabase-js';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';

import { serviceSupabase } from '../../db/client.js';
import { auditLog } from '../../lib/auditLog.js';
import { validatePhone } from '../../lib/phoneValidation.js';
import { createRateLimiter } from '../../lib/rateLimiter.js';

const BodySchema = z.object({ phone: z.string() });

const IP_LIMIT_MAX = 3;
const MS_PER_HOUR = 3_600_000;
const COOLDOWN_MINUTES = 2;
const MS_PER_MINUTE = 60_000;
const COOLDOWN_MS = COOLDOWN_MINUTES * MS_PER_MINUTE;
const MS_PER_DAY = 86_400_000;
const MAX_RESENDS_24H = 10;
const INITIAL_RESEND_COUNT = 1;
const RESEND_INCREMENT = 1;

const HTTP_BAD_REQUEST = 400;
const HTTP_RATE_LIMITED = 429;
const HTTP_INTERNAL = 500;

const ipLimiter = createRateLimiter({ max: IP_LIMIT_MAX, windowMs: MS_PER_HOUR });

interface CooldownRow {
  next_allowed_at: string;
}

interface OtpAttemptsRow {
  resends_24h: number;
  resends_window_start: string;
}

interface ResendWindowUpdate {
  userId: string;
  phone: string;
  resends: number;
  windowStart: string;
}

function isSupabaseClient(v: unknown): v is SupabaseClient {
  return v !== null && typeof v === 'object' && 'auth' in v;
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

async function checkCooldown(
  service: SupabaseClient,
  userId: string
): Promise<{ blocked: true; until: string } | { blocked: false }> {
  const { data } = await service
    .from('otp_cooldowns')
    .select('next_allowed_at')
    .eq('user_id', userId)
    .maybeSingle<CooldownRow>();
  if (data === null) return { blocked: false };
  if (new Date(data.next_allowed_at) > new Date()) return { blocked: true, until: data.next_allowed_at };
  return { blocked: false };
}

async function upsertCooldown(service: SupabaseClient, userId: string): Promise<string> {
  const nextAllowedAt = new Date(Date.now() + COOLDOWN_MS).toISOString();
  await service
    .from('otp_cooldowns')
    .upsert({ user_id: userId, next_allowed_at: nextAllowedAt }, { onConflict: 'user_id' });
  return nextAllowedAt;
}

async function getResendWindow(
  service: SupabaseClient,
  userId: string,
  phone: string
): Promise<OtpAttemptsRow | null> {
  const { data } = await service
    .from('otp_attempts')
    .select('resends_24h, resends_window_start')
    .eq('user_id', userId)
    .eq('phone', phone)
    .maybeSingle<OtpAttemptsRow>();
  return data ?? null;
}

function computeNewResends(row: OtpAttemptsRow | null): { resends: number; windowStart: string } {
  if (row === null) return { resends: INITIAL_RESEND_COUNT, windowStart: new Date().toISOString() };
  const elapsed = Date.now() - new Date(row.resends_window_start).getTime();
  if (elapsed >= MS_PER_DAY) return { resends: INITIAL_RESEND_COUNT, windowStart: new Date().toISOString() };
  return { resends: row.resends_24h + RESEND_INCREMENT, windowStart: row.resends_window_start };
}

async function upsertResendWindow(service: SupabaseClient, params: ResendWindowUpdate): Promise<void> {
  await service
    .from('otp_attempts')
    .upsert(
      {
        user_id: params.userId,
        phone: params.phone,
        resends_24h: params.resends,
        resends_window_start: params.windowStart,
      },
      { onConflict: 'user_id,phone' }
    );
}

async function checkAndUpdateResends(service: SupabaseClient, userId: string, phone: string): Promise<boolean> {
  const existing = await getResendWindow(service, userId, phone);
  const { resends, windowStart } = computeNewResends(existing);
  if (resends > MAX_RESENDS_24H) return false;
  await upsertResendWindow(service, { userId, phone, resends, windowStart });
  return true;
}

async function handleSendOtp(req: Request, res: Response): Promise<void> {
  const ip = req.ip ?? 'unknown';
  if (!ipLimiter.consume(ip)) {
    res.status(HTTP_RATE_LIMITED).json({ error: 'rate_limited' });
    return;
  }
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'invalid_body' });
    return;
  }
  const v = validatePhone(parsed.data.phone);
  if (!v.ok) {
    res.status(HTTP_BAD_REQUEST).json({ error: v.error });
    return;
  }
  const userId = getUserId(res);
  const supabase = getSupabase(res);
  const service: SupabaseClient = serviceSupabase();
  const cooldown = await checkCooldown(service, userId);
  if (cooldown.blocked) {
    res.status(HTTP_RATE_LIMITED).json({ error: 'cooldown', cooldownUntil: cooldown.until });
    return;
  }
  const resendAllowed = await checkAndUpdateResends(service, userId, v.e164);
  if (!resendAllowed) {
    res.status(HTTP_RATE_LIMITED).json({ error: 'otp_rate_limited_24h' });
    return;
  }
  const cooldownUntil = await upsertCooldown(service, userId);
  const { error } = await supabase.auth.updateUser({ phone: v.e164 });
  if (error !== null) {
    res.status(HTTP_INTERNAL).json({ error: 'send_failed' });
    return;
  }
  await auditLog({ event: 'phone_send_otp', userId, phone: v.e164, ip });
  res.json({ ok: true, cooldownUntil });
}

export function phoneSendOtpRouter(): express.Router {
  const router = express.Router();
  router.post('/send-otp', handleSendOtp);
  return router;
}
