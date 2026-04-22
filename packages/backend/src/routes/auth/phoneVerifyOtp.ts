import type { SupabaseClient } from '@supabase/supabase-js';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';

import { serviceSupabase } from '../../db/client.js';
import { auditLog } from '../../lib/auditLog.js';
import { goTrueVerifyPhoneChangeOtp } from '../../lib/gotrue.js';
import { validatePhone } from '../../lib/phoneValidation.js';
import { requirePhoneUnverified } from '../../middleware/gates.js';

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

interface OtpRecordFailResult {
  data: number | null;
  error: { message: string } | null;
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

async function recordFail(userId: string, phone: string): Promise<number> {
  const service: SupabaseClient = serviceSupabase();
  const { data } = (await service.rpc('otp_record_fail', {
    p_user: userId,
    p_phone: phone,
  })) as OtpRecordFailResult;
  if (typeof data !== 'number') return ZERO_FAILS;
  return data;
}

async function recordSuccess(userId: string, phone: string): Promise<void> {
  const service: SupabaseClient = serviceSupabase();
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
  const jwt = getJwt(res);
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
  const result = await goTrueVerifyPhoneChangeOtp(jwt, v.e164, parsed.data.token);
  if (!result.ok) {
    const ip = req.ip ?? 'unknown';
    await handleFailedOtp(userId, v.e164, ip);
    res.status(HTTP_BAD_REQUEST).json({ error: 'invalid_otp' });
    return;
  }
  if (result.session.user_id !== userId) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'sub_mismatch' });
    return;
  }
  await recordSuccess(userId, v.e164);
  await auditLog({ event: 'phone_verified', userId, phone: v.e164, ip: req.ip });
  res.json({
    access_token: result.session.access_token,
    refresh_token: result.session.refresh_token,
  });
}

export function phoneVerifyOtpRouter(): express.Router {
  const router = express.Router();
  router.post('/verify-otp', requirePhoneUnverified, handleVerifyOtp);
  return router;
}
