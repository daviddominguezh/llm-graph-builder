import { fetchFromBackend } from '@/app/lib/backendProxy';
import { AUTH_COOKIE_OPTIONS } from '@/app/lib/supabase/cookies';
import { createClient } from '@/app/lib/supabase/server';
import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

function extractProjectRef(url: string): string {
  if (url === '') return '';
  try {
    return new URL(url).host.split('.')[0] ?? '';
  } catch {
    return '';
  }
}

const PROJECT_REF = extractProjectRef(SUPABASE_URL);
const SUPABASE_COOKIE_NAMES = [
  `sb-${PROJECT_REF}-auth-token`,
  `sb-${PROJECT_REF}-auth-token.0`,
  `sb-${PROJECT_REF}-auth-token.1`,
];

interface DuplicateResult {
  duplicate: boolean;
  email?: string;
}

function isDuplicateResult(value: unknown): value is DuplicateResult {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['duplicate'] === 'boolean';
}

function clearSessionCookies(res: NextResponse): void {
  for (const name of SUPABASE_COOKIE_NAMES) {
    res.cookies.set(name, '', { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
  }
  res.cookies.set('_auth_status', '', { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
}

function buildDuplicateRedirect(origin: string, email: string): NextResponse {
  const url = new URL(`${origin}/login`);
  url.searchParams.set('error', 'oauth_duplicate');
  url.searchParams.set('email', email);
  const res = NextResponse.redirect(url);
  clearSessionCookies(res);
  return res;
}

async function checkDuplicate(origin: string): Promise<NextResponse | null> {
  try {
    const raw = await fetchFromBackend('POST', '/auth/public/handle-oauth-duplicate');
    if (!isDuplicateResult(raw) || !raw.duplicate || raw.email === undefined) return null;
    const supabase = await createClient();
    try {
      await supabase.auth.signOut();
    } catch {
      // proceed anyway — session cookies are cleared explicitly below
    }
    return buildDuplicateRedirect(origin, raw.email);
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code !== null) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error === null) {
      const isRecovery = next === '/reset-password' || searchParams.get('type') === 'recovery';
      if (isRecovery) return NextResponse.redirect(`${origin}/reset-password`);

      const dupResp = await checkDuplicate(origin);
      if (dupResp !== null) return dupResp;

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
