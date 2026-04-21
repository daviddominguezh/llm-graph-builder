import type { NextFunction, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';

interface GateRow {
  onboarding_completed_at: string | null;
  grandfathered_at: string | null;
}

interface GateFlags {
  phoneVerified: boolean;
  onboardingCompleted: boolean;
}

const HTTP_FORBIDDEN = 403;

async function fetchGateRow(
  supabase: SupabaseClient,
  userId: string
): Promise<GateRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('onboarding_completed_at, grandfathered_at')
    .eq('id', userId)
    .single();
  if (error !== null || data === null) return null;
  return data as GateRow;
}

async function fetchPhoneConfirmedAt(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.phone_confirmed_at ?? null;
}

async function loadGateFlags(
  supabase: SupabaseClient,
  userId: string
): Promise<GateFlags | null> {
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

export async function requireGateComplete(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const supabase = res.locals.supabase as SupabaseClient;
  const userId = res.locals.userId as string;
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

export async function requirePhoneUnverified(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const supabase = res.locals.supabase as SupabaseClient;
  const userId = res.locals.userId as string;
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
  const supabase = res.locals.supabase as SupabaseClient;
  const userId = res.locals.userId as string;
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
