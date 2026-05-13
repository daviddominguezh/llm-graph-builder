import { type AuthFlags, fetchAuthStatus } from '@/app/lib/auth/fetchStatus';
import { signStatusCookie, verifyStatusCookie } from '@/app/lib/auth/statusCookie';
import { computeTokenBinding } from '@/app/lib/auth/tokenBinding';
import { verifyAccessToken } from '@/app/lib/auth/verifyJwt';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { AUTH_COOKIE_OPTIONS } from './cookies';

const PUBLIC_ROUTES = ['/auth/callback', '/reset-password', '/error', '/api/chat', '/api/auth/public'];
const GUEST_ONLY_ROUTES = ['/login', '/signup', '/forgot-password'];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const HTTP_FORBIDDEN = 403;

function startsWithAny(path: string, routes: string[]): boolean {
  return routes.some((r) => path === r || path.startsWith(`${r}/`));
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

async function loadFlags(
  accessToken: string,
  uid: string,
  request: NextRequest,
  res: NextResponse
): Promise<AuthFlags | null> {
  const binding = computeTokenBinding(accessToken);
  const cached = request.cookies.get('_auth_status')?.value;
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

// All /api/auth/* endpoints have their own backend gate middlewares
// (requirePhoneUnverified, requireOnboardingIncomplete, requireGateComplete).
// Let the backend decide so callers get precise errors instead of the
// generic redirect/403 from this middleware.
function phoneGateAllows(pathname: string): boolean {
  return pathname === '/verify-phone' || pathname.startsWith('/api/auth/');
}

function onboardingGateAllows(pathname: string): boolean {
  return pathname === '/onboarding' || pathname.startsWith('/api/auth/');
}

interface AuthResolution {
  accessToken: string;
  userId: string;
}

async function resolveAuth(supabase: SupabaseClient): Promise<AuthResolution | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session === null) return null;

  const claims = await verifyAccessToken(session.access_token);
  if (claims !== null) {
    return { accessToken: session.access_token, userId: claims.sub };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) return null;
  return { accessToken: session.access_token, userId: user.id };
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({ request });
  const supabase = buildSupabaseClient(request, response);
  const { pathname } = request.nextUrl;

  if (startsWithAny(pathname, PUBLIC_ROUTES)) return response;

  const auth = await resolveAuth(supabase);
  if (auth === null) {
    if (startsWithAny(pathname, GUEST_ONLY_ROUTES)) return response;
    return redirectTo(request, '/login', response);
  }
  if (startsWithAny(pathname, GUEST_ONLY_ROUTES)) return redirectTo(request, '/', response);

  const flags = await loadFlags(auth.accessToken, auth.userId, request, response);
  if (flags === null) {
    if (wantsJson(request)) return jsonError(HTTP_FORBIDDEN, 'auth_status_unavailable');
    return redirectTo(request, '/error', response);
  }

  if (!flags.phone_verified) {
    if (phoneGateAllows(pathname)) return response;
    if (wantsJson(request)) return jsonError(HTTP_FORBIDDEN, 'phone_verification_required');
    return redirectTo(request, '/verify-phone', response);
  }
  if (!flags.onboarding_completed) {
    if (onboardingGateAllows(pathname)) return response;
    if (wantsJson(request)) return jsonError(HTTP_FORBIDDEN, 'onboarding_required');
    return redirectTo(request, '/onboarding', response);
  }
  if (startsWithAny(pathname, ['/verify-phone', '/onboarding'])) {
    return redirectTo(request, '/', response);
  }
  return response;
}
