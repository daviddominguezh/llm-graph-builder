import { createClient } from '@/app/lib/supabase/server';
import { fetchFromBackend } from '@/app/lib/backendProxy';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE_OPTIONS } from '@/app/lib/supabase/cookies';

interface VerifyResult {
  access_token: string;
  refresh_token: string;
}

const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL = 500;

function parseStatusFromErrorMessage(msg: string): number {
  const m = /\((?<status>\d{3})\):/u.exec(msg);
  if (m?.groups?.status !== undefined) return Number(m.groups.status);
  return HTTP_INTERNAL;
}

function isVerifyResult(value: unknown): value is VerifyResult {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.access_token === 'string' && typeof v.refresh_token === 'string';
}

async function rewriteSession(raw: VerifyResult): Promise<{ error: string } | null> {
  const supabase = await createClient();
  const { data: before } = await supabase.auth.getUser();
  const { error: setErr } = await supabase.auth.setSession({
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
  });
  if (setErr !== null) return { error: 'session_set_failed' };
  const { data: after } = await supabase.auth.getUser();
  if (before.user !== null && after.user !== null && before.user.id !== after.user.id) {
    return { error: 'sub_mismatch' };
  }
  return null;
}

function invalidateAuthStatusCookie(res: NextResponse): void {
  res.cookies.set('_auth_status', '', { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  try {
    const raw = await fetchFromBackend('POST', '/auth/phone/verify-otp', body);
    if (!isVerifyResult(raw)) {
      return NextResponse.json({ error: 'malformed_response' }, { status: HTTP_INTERNAL });
    }
    const sessionError = await rewriteSession(raw);
    if (sessionError !== null) {
      const status = sessionError.error === 'sub_mismatch' ? HTTP_BAD_REQUEST : HTTP_INTERNAL;
      return NextResponse.json({ error: sessionError.error }, { status });
    }
    const res = NextResponse.json({ ok: true });
    invalidateAuthStatusCookie(res);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'verify_failed';
    const status = parseStatusFromErrorMessage(msg);
    return NextResponse.json({ error: 'verify_failed' }, { status });
  }
}
