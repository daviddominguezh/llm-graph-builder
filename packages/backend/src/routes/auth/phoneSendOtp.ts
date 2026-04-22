import type { SupabaseClient } from '@supabase/supabase-js';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';

import { serviceSupabase } from '../../db/client.js';
import { auditLog } from '../../lib/auditLog.js';
import { goTrueUpdateUserPhone } from '../../lib/gotrue.js';
import { validatePhone } from '../../lib/phoneValidation.js';
import { createRateLimiter } from '../../lib/rateLimiter.js';
import { requirePhoneUnverified } from '../../middleware/gates.js';

const BodySchema = z.object({ phone: z.string() });

const IP_LIMIT_MAX = 30;
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
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL = 500;

const PHONE_TAKEN_PATTERNS = [/already been registered/iv, /phone.*already/iv, /duplicate.*phone/iv];

function isPhoneTakenError(message: string): boolean {
  return PHONE_TAKEN_PATTERNS.some((re) => re.test(message));
}

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

function getUserId(res: Response): string {
  const v: unknown = res.locals.userId;
  if (typeof v !== 'string') throw new Error('userId missing');
  return v;
}

function getJwt(res: Response): string {
  const v: unknown = res.locals.jwt;
  if (typeof v !== 'string') throw new Error('jwt missing');
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
  await service.from('otp_attempts').upsert(
    {
      user_id: params.userId,
      phone: params.phone,
      resends_24h: params.resends,
      resends_window_start: params.windowStart,
    },
    { onConflict: 'user_id,phone' }
  );
}

async function computeResendsNextOrReject(
  service: SupabaseClient,
  userId: string,
  phone: string
): Promise<{ resends: number; windowStart: string } | null> {
  const existing = await getResendWindow(service, userId, phone);
  const next = computeNewResends(existing);
  if (next.resends > MAX_RESENDS_24H) return null;
  return next;
}

interface PreChecks {
  userId: string;
  jwt: string;
  service: SupabaseClient;
  e164: string;
  resendNext: { resends: number; windowStart: string };
}

async function runPreChecks(req: Request, res: Response): Promise<PreChecks | null> {
  const ip = req.ip ?? 'unknown';
  if (!ipLimiter.consume(ip)) {
    res.status(HTTP_RATE_LIMITED).json({ error: 'rate_limited' });
    return null;
  }
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'invalid_body' });
    return null;
  }
  const v = validatePhone(parsed.data.phone);
  if (!v.ok) {
    res.status(HTTP_BAD_REQUEST).json({ error: v.error });
    return null;
  }
  const userId = getUserId(res);
  const jwt = getJwt(res);
  const service: SupabaseClient = serviceSupabase();
  const cooldown = await checkCooldown(service, userId);
  if (cooldown.blocked) {
    res.status(HTTP_RATE_LIMITED).json({ error: 'cooldown', cooldownUntil: cooldown.until });
    return null;
  }
  const resendNext = await computeResendsNextOrReject(service, userId, v.e164);
  if (resendNext === null) {
    res.status(HTTP_RATE_LIMITED).json({ error: 'otp_rate_limited_24h' });
    return null;
  }
  return { userId, jwt, service, e164: v.e164, resendNext };
}

interface RpcBoolResult {
  data: boolean | null;
}

async function reclaimStalePhone(service: SupabaseClient, phone: string, userId: string): Promise<boolean> {
  const { data } = (await service.rpc('reclaim_stale_phone', {
    p_phone: phone,
    p_user_id: userId,
  })) as RpcBoolResult;
  return data === true;
}

interface AttemptSuccess {
  ok: true;
}
interface AttemptFailure {
  ok: false;
  status: number;
  error: string;
  detail?: string;
}
type AttemptResult = AttemptSuccess | AttemptFailure;

async function attemptSetPhone(pre: PreChecks): Promise<AttemptResult> {
  const first = await goTrueUpdateUserPhone(pre.jwt, pre.e164);
  if (first.ok) return { ok: true };
  if (!isPhoneTakenError(first.error)) {
    process.stderr.write(`[phoneSendOtp] updateUser failed: ${first.error}\n`);
    return { ok: false, status: HTTP_INTERNAL, error: 'send_failed', detail: first.error };
  }
  const reclaimed = await reclaimStalePhone(pre.service, pre.e164, pre.userId);
  if (!reclaimed) return { ok: false, status: HTTP_CONFLICT, error: 'phone_taken' };
  const retry = await goTrueUpdateUserPhone(pre.jwt, pre.e164);
  if (retry.ok) return { ok: true };
  return { ok: false, status: HTTP_CONFLICT, error: 'phone_taken' };
}

function sendAttemptFailure(res: Response, failure: AttemptFailure): void {
  const { detail, error, status } = failure;
  const body: Record<string, string> = { error };
  if (detail !== undefined) body.detail = detail;
  res.status(status).json(body);
}

async function recordSuccess(pre: PreChecks, ip: string | undefined): Promise<string> {
  const cooldownUntil = await upsertCooldown(pre.service, pre.userId);
  await upsertResendWindow(pre.service, {
    userId: pre.userId,
    phone: pre.e164,
    resends: pre.resendNext.resends,
    windowStart: pre.resendNext.windowStart,
  });
  await auditLog({ event: 'phone_send_otp', userId: pre.userId, phone: pre.e164, ip });
  return cooldownUntil;
}

async function handleSendOtp(req: Request, res: Response): Promise<void> {
  const pre = await runPreChecks(req, res);
  if (pre === null) return;
  const attempt = await attemptSetPhone(pre);
  if (!attempt.ok) {
    sendAttemptFailure(res, attempt);
    return;
  }
  const cooldownUntil = await recordSuccess(pre, req.ip);
  res.json({ ok: true, cooldownUntil });
}

export function phoneSendOtpRouter(): express.Router {
  const router = express.Router();
  router.post('/send-otp', requirePhoneUnverified, handleSendOtp);
  return router;
}
