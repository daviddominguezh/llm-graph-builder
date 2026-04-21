import type { SupabaseClient } from '@supabase/supabase-js';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';

import { serviceSupabase } from '../../db/client.js';
import { auditLog } from '../../lib/auditLog.js';
import { validatePhone } from '../../lib/phoneValidation.js';

const OTP_LENGTH = 6;
const MAX_FAILS_BEFORE_LOCK = 5;
const ZERO_FAILS = 0;

const BodySchema = z.object({
  phone: z.string(),
  token: z.string().length(OTP_LENGTH),
});

const HTTP_BAD_REQUEST = 400;
const HTTP_RATE_LIMITED = 429;

interface OtpAttemptRow {
  locked_until: string | null;
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

async function recordFail(userId: string, phone: string): Promise<number> {
  const service = serviceSupabase();
  const { data } = await service.rpc('otp_record_fail', { p_user: userId, p_phone: phone });
  if (typeof data !== 'number') return ZERO_FAILS;
  return data;
}

async function recordSuccess(userId: string, phone: string): Promise<void> {
  const service = serviceSupabase();
  await service
    .from('otp_attempts')
    .update({ fails: ZERO_FAILS, locked_until: null })
    .eq('user_id', userId)
    .eq('phone', phone);
}

async function isLocked(userId: string, phone: string): Promise<boolean> {
  const service = serviceSupabase();
  const { data } = await service
    .from('otp_attempts')
    .select('locked_until')
    .eq('user_id', userId)
    .eq('phone', phone)
    .maybeSingle<OtpAttemptRow>();
  const lockedUntil = data?.locked_until;
  if (lockedUntil === null || lockedUntil === undefined) return false;
  return new Date(lockedUntil) > new Date();
}

async function handleFailedOtp(userId: string, phone: string, ip: string): Promise<void> {
  const fails = await recordFail(userId, phone);
  await auditLog({ event: 'otp_verify_failed', userId, phone, ip, metadata: { fails } });
  if (fails >= MAX_FAILS_BEFORE_LOCK) {
    await auditLog({ event: 'otp_lockout', userId, phone, ip });
  }
}

async function handleVerifyOtp(req: Request, res: Response): Promise<void> {
  const userId = getUserId(res);
  const supabase = getSupabase(res);
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
  if (await isLocked(userId, v.e164)) {
    res.status(HTTP_RATE_LIMITED).json({ error: 'otp_locked' });
    return;
  }
  const { data, error } = await supabase.auth.verifyOtp({
    phone: v.e164,
    token: parsed.data.token,
    type: 'phone_change',
  });
  if (error !== null || data.session === null) {
    const ip = req.ip ?? 'unknown';
    await handleFailedOtp(userId, v.e164, ip);
    res.status(HTTP_BAD_REQUEST).json({ error: 'invalid_otp' });
    return;
  }
  if (data.session.user.id !== userId) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'sub_mismatch' });
    return;
  }
  await recordSuccess(userId, v.e164);
  await auditLog({ event: 'phone_verified', userId, phone: v.e164, ip: req.ip });
  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
}

export function phoneVerifyOtpRouter(): express.Router {
  const router = express.Router();
  router.post('/verify-otp', handleVerifyOtp);
  return router;
}
