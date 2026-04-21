import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { fetchAuthStatus, type AuthFlags } from '@/app/lib/auth/fetchStatus';
import { signStatusCookie, verifyStatusCookie } from '@/app/lib/auth/statusCookie';
import { computeTokenBinding } from '@/app/lib/auth/tokenBinding';
import { AUTH_COOKIE_OPTIONS } from './cookies';

const PUBLIC_ROUTES = ['/auth/callback', '/reset-password', '/error', '/api/chat'];
const GUEST_ONLY_ROUTES = ['/login', '/signup', '/forgot-password'];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const HTTP_FORBIDDEN = 403;

function startsWithAny(path: string, routes: string[]): boolean {
  return routes.some((r) => path === r || path.startsWith(r + '/'));
}

function wantsJson(req: NextRequest): boolean {
  const accept = req.headers.get('accept');
  if (accept !== null && accept.includes('application/json')) return true;
  return req.nextUrl.pathname.startsWith('/api/');
}

function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

function redirectTo(req: NextRequest, path: string, carry: NextResponse): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = path;
  const next = NextResponse.redirect(url);
  carry.cookies.getAll().forEach((c) => next.cookies.set(c.name, c.value));
  return next;
}

function buildSupabaseClient(request: NextRequest, response: NextResponse) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });
}

async function loadFlags(accessToken: string, uid: string, res: NextResponse): Promise<AuthFlags | null> {
  const binding = computeTokenBinding(accessToken);
  const cached = res.cookies.get('_auth_status')?.value;
  if (cached !== undefined) {
    const parsed = verifyStatusCookie(cached);
    if (parsed !== null && parsed.uid === uid && parsed.tokenBinding === binding) {
      return { phone_verified: parsed.phone_verified, onboarding_completed: parsed.onboarding_completed };
    }
  }
  const flags = await fetchAuthStatus(accessToken);
  if (flags !== null) {
    const cookie = signStatusCookie({ uid, tokenBinding: binding, ...flags });
    res.cookies.set('_auth_status', cookie, AUTH_COOKIE_OPTIONS);
  }
  return flags;
}

function handlePhoneGate(req: NextRequest, res: NextResponse, pathname: string): NextResponse | null {
  if (pathname === '/verify-phone' || pathname.startsWith('/api/auth/phone')) return null;
  if (wantsJson(req)) return jsonError(HTTP_FORBIDDEN, 'phone_verification_required');
  return redirectTo(req, '/verify-phone', res);
}

function handleOnboardingGate(req: NextRequest, res: NextResponse, pathname: string): NextResponse | null {
  if (pathname === '/onboarding' || pathname === '/api/auth/complete-onboarding') return null;
  if (wantsJson(req)) return jsonError(HTTP_FORBIDDEN, 'onboarding_required');
  return redirectTo(req, '/onboarding', res);
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({ request });
  const supabase = buildSupabaseClient(request, response);
  const { pathname } = request.nextUrl;

  if (startsWithAny(pathname, PUBLIC_ROUTES)) return response;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    if (startsWithAny(pathname, GUEST_ONLY_ROUTES)) return response;
    return redirectTo(request, '/login', response);
  }
  if (startsWithAny(pathname, GUEST_ONLY_ROUTES)) return redirectTo(request, '/', response);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session === null) return redirectTo(request, '/login', response);

  const flags = await loadFlags(session.access_token, user.id, response);
  if (flags === null) {
    if (wantsJson(request)) return jsonError(HTTP_FORBIDDEN, 'auth_status_unavailable');
    return redirectTo(request, '/error', response);
  }

  if (!flags.phone_verified) {
    const gated = handlePhoneGate(request, response, pathname);
    if (gated !== null) return gated;
  }
  if (!flags.onboarding_completed) {
    const gated = handleOnboardingGate(request, response, pathname);
    if (gated !== null) return gated;
  }
  if (startsWithAny(pathname, ['/verify-phone', '/onboarding'])) {
    return redirectTo(request, '/', response);
  }
  return response;
}
