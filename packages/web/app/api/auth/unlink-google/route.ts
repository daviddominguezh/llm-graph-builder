import { fetchFromBackend } from '@/app/lib/backendProxy';
import { AUTH_COOKIE_OPTIONS } from '@/app/lib/supabase/cookies';
import { NextResponse } from 'next/server';

const HTTP_INTERNAL = 500;

export async function POST(): Promise<Response> {
  try {
    await fetchFromBackend('POST', '/auth/unlink-google');
    const res = NextResponse.json({ ok: true });
    res.cookies.set('_auth_status', '', { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed';
    return NextResponse.json({ error: msg }, { status: HTTP_INTERNAL });
  }
}
