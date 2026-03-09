import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

type Database = Record<string, never>;

// Guest-only: redirect to / if authenticated
const GUEST_ONLY_ROUTES = ['/login', '/signup', '/forgot-password'];

// Public: no auth checks at all (callback needs to run before session exists,
// reset-password needs session access after recovery callback)
const PUBLIC_ROUTES = ['/auth/callback', '/reset-password'];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function isGuestOnlyRoute(pathname: string): boolean {
  return GUEST_ONLY_ROUTES.some((route) => pathname.startsWith(route));
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

function createSupabaseMiddlewareClient(
  request: NextRequest,
  response: NextResponse
): SupabaseClient<Database> {
  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
}

function redirectWithCookies(url: URL, sourceResponse: NextResponse): NextResponse {
  const response = NextResponse.redirect(url);
  sourceResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie.name, cookie.value);
  });
  return response;
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const supabaseResponse = NextResponse.next({ request });
  const supabase = createSupabaseMiddlewareClient(request, supabaseResponse);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isPublicRoute(request.nextUrl.pathname)) {
    return supabaseResponse;
  }

  if (user === null && !isGuestOnlyRoute(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return redirectWithCookies(url, supabaseResponse);
  }

  if (user !== null && isGuestOnlyRoute(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return redirectWithCookies(url, supabaseResponse);
  }

  return supabaseResponse;
}
