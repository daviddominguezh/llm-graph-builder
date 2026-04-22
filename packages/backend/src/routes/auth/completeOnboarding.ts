import {
  BUILD_GOAL_OPTIONS,
  COMPANY_SIZE_OPTIONS,
  INDUSTRY_OPTIONS,
  REFERRAL_OPTIONS,
  ROLE_OPTIONS,
} from '@openflow/shared-validation';
import type { SupabaseClient } from '@supabase/supabase-js';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';

import { auditLog } from '../../lib/auditLog.js';
import { requireOnboardingIncomplete } from '../../middleware/gates.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL = 500;
const ARRAY_MIN = 1;
const ARRAY_MAX = 20;
const PG_UNIQUE_VIOLATION = '23505';

const BodySchema = z.object({
  industry: z.enum(INDUSTRY_OPTIONS),
  company_size: z.enum(COMPANY_SIZE_OPTIONS),
  role: z.enum(ROLE_OPTIONS),
  referral_sources: z.array(z.enum(REFERRAL_OPTIONS)).min(ARRAY_MIN).max(ARRAY_MAX),
  build_goals: z.array(z.enum(BUILD_GOAL_OPTIONS)).min(ARRAY_MIN).max(ARRAY_MAX),
});

type OnboardingBody = z.infer<typeof BodySchema>;

interface InsertError {
  code: string;
  message: string;
}

interface InsertResult {
  error: InsertError | null;
}

function isSupabaseClient(v: unknown): v is SupabaseClient {
  return v !== null && typeof v === 'object' && 'from' in v;
}

function getSupabase(res: Response): SupabaseClient {
  const v: unknown = res.locals.supabase;
  if (!isSupabaseClient(v)) throw new Error('supabase missing from locals');
  return v;
}

function getUserId(res: Response): string {
  const v: unknown = res.locals.userId;
  if (typeof v !== 'string') throw new Error('userId missing from locals');
  return v;
}

async function insertOnboarding(
  supabase: SupabaseClient,
  userId: string,
  body: OnboardingBody
): Promise<InsertResult> {
  return (await supabase.from('user_onboarding').insert({
    user_id: userId,
    industry: body.industry,
    company_size: body.company_size,
    role: body.role,
    referral_sources: body.referral_sources,
    build_goals: body.build_goals,
  })) as InsertResult;
}

async function markOnboardingComplete(supabase: SupabaseClient, userId: string): Promise<InsertResult> {
  return (await supabase
    .from('users')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', userId)) as InsertResult;
}

async function handleCompleteOnboarding(req: Request, res: Response): Promise<void> {
  const userId = getUserId(res);
  const supabase = getSupabase(res);

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const insertResult = await insertOnboarding(supabase, userId, parsed.data);
  if (insertResult.error !== null) {
    if (insertResult.error.code === PG_UNIQUE_VIOLATION) {
      res.status(HTTP_CONFLICT).json({ error: 'already_completed' });
      return;
    }
    res.status(HTTP_INTERNAL).json({ error: 'insert_failed' });
    return;
  }

  const updateResult = await markOnboardingComplete(supabase, userId);
  if (updateResult.error !== null) {
    res.status(HTTP_INTERNAL).json({ error: 'update_failed' });
    return;
  }

  await auditLog({ event: 'onboarding_completed', userId });
  res.status(HTTP_OK).json({ ok: true });
}

export function completeOnboardingRouter(): express.Router {
  const router = express.Router();
  router.post('/complete-onboarding', requireOnboardingIncomplete, handleCompleteOnboarding);
  return router;
}
