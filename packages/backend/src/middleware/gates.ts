import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';

interface GateRow {
  onboarding_completed_at: string | null;
  grandfathered_at: string | null;
}

interface GateFlags {
  phoneVerified: boolean;
  onboardingCompleted: boolean;
}

const HTTP_FORBIDDEN = 403;

function isGateRow(value: unknown): value is GateRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'onboarding_completed_at' in value && 'grandfathered_at' in value;
}

function isSupabaseClient(value: unknown): value is SupabaseClient {
  return typeof value === 'object' && value !== null && 'from' in value && 'auth' in value;
}

function getLocals(res: Response): { supabase: SupabaseClient; userId: string } {
  const supabaseVal: unknown = res.locals.supabase;
  const userIdVal: unknown = res.locals.userId;
  if (!isSupabaseClient(supabaseVal)) throw new Error('supabase not in locals');
  if (typeof userIdVal !== 'string') throw new Error('userId missing from locals');
  return { supabase: supabaseVal, userId: userIdVal };
}

async function fetchGateRow(supabase: SupabaseClient, userId: string): Promise<GateRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('onboarding_completed_at, grandfathered_at')
    .eq('id', userId)
    .single();
  if (error !== null) return null;
  return isGateRow(data) ? data : null;
}

async function fetchPhoneConfirmedAt(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  const phoneConfirmedAt = data.user?.phone_confirmed_at;
  return phoneConfirmedAt ?? null;
}

async function loadGateFlags(supabase: SupabaseClient, userId: string): Promise<GateFlags | null> {
  const row = await fetchGateRow(supabase, userId);
  if (row === null) return null;
  const phoneConfirmedAt = await fetchPhoneConfirmedAt(supabase);
  const phoneVerified = phoneConfirmedAt !== null || row.grandfathered_at !== null;
  const onboardingCompleted = row.onboarding_completed_at !== null;
  return { phoneVerified, onboardingCompleted };
}

function send403(res: Response, error: string): void {
  res.status(HTTP_FORBIDDEN).json({ error });
}

export async function requireGateComplete(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { supabase, userId } = getLocals(res);
  const flags = await loadGateFlags(supabase, userId);
  if (flags === null) {
    send403(res, 'gate_lookup_failed');
    return;
  }
  if (!flags.phoneVerified) {
    send403(res, 'phone_verification_required');
    return;
  }
  if (!flags.onboardingCompleted) {
    send403(res, 'onboarding_required');
    return;
  }
  next();
}

export async function requirePhoneUnverified(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { supabase, userId } = getLocals(res);
  const flags = await loadGateFlags(supabase, userId);
  if (flags === null) {
    send403(res, 'gate_lookup_failed');
    return;
  }
  if (flags.phoneVerified) {
    send403(res, 'phone_already_verified');
    return;
  }
  next();
}

export async function requireOnboardingIncomplete(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { supabase, userId } = getLocals(res);
  const flags = await loadGateFlags(supabase, userId);
  if (flags === null) {
    send403(res, 'gate_lookup_failed');
    return;
  }
  if (flags.onboardingCompleted) {
    send403(res, 'onboarding_already_completed');
    return;
  }
  next();
}
