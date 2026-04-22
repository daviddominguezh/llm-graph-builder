/**
 * Direct calls to Supabase GoTrue endpoints for auth-scoped mutations
 * that supabase-js's JWT-header-only client cannot perform.
 *
 * `createSupabaseClient(jwt)` forwards the JWT on REST (PostgREST) calls
 * so RLS applies correctly, but `supabase.auth.updateUser()` and
 * `supabase.auth.verifyOtp()` rely on the client's internal session
 * storage — which isn't set when we only have the access token. Calling
 * GoTrue directly with `Authorization: Bearer <jwt>` is what the browser
 * client does under the hood.
 */

function getRequiredEnv(name: string): string {
  const value: unknown = Reflect.get(process.env, name);
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v: unknown = Reflect.get(obj, key);
  return typeof v === 'string' ? v : null;
}

function buildHeaders(jwt: string): Record<string, string> {
  return {
    Authorization: `Bearer ${jwt}`,
    apikey: getRequiredEnv('SUPABASE_ANON_KEY'),
    'Content-Type': 'application/json',
  };
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const raw: unknown = await res.json();
    if (!isRecord(raw)) return `HTTP ${String(res.status)}`;
    return (
      pickString(raw, 'msg') ??
      pickString(raw, 'error_description') ??
      pickString(raw, 'error') ??
      `HTTP ${String(res.status)}`
    );
  } catch {
    return `HTTP ${String(res.status)}`;
  }
}

/**
 * Triggers Supabase to send an SMS OTP to the given phone for the current
 * user, setting their pending `phone` / `phone_change` value. Matches what
 * `supabase.auth.updateUser({ phone })` does on the browser.
 */
export async function goTrueUpdateUserPhone(
  jwt: string,
  phone: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = `${getRequiredEnv('SUPABASE_URL')}/auth/v1/user`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: buildHeaders(jwt),
    body: JSON.stringify({ phone }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: await readErrorMessage(res) };
}

export interface VerifyOtpSession {
  access_token: string;
  refresh_token: string;
  user_id: string;
}

/**
 * Verifies a phone_change OTP for the current user. On success GoTrue
 * returns a new session; we pass those tokens back so Next.js can rewrite
 * the browser's session cookie.
 */
export async function goTrueVerifyPhoneChangeOtp(
  jwt: string,
  phone: string,
  token: string
): Promise<{ ok: true; session: VerifyOtpSession } | { ok: false; status: number; error: string }> {
  const url = `${getRequiredEnv('SUPABASE_URL')}/auth/v1/verify`;
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(jwt),
    body: JSON.stringify({ type: 'phone_change', phone, token }),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, error: await readErrorMessage(res) };
  }
  const raw: unknown = await res.json();
  if (!isRecord(raw)) return { ok: false, status: res.status, error: 'malformed_response' };
  const accessToken = pickString(raw, 'access_token');
  const refreshToken = pickString(raw, 'refresh_token');
  const { user } = raw;
  const userId = isRecord(user) ? pickString(user, 'id') : null;
  if (accessToken === null || refreshToken === null || userId === null) {
    return { ok: false, status: res.status, error: 'malformed_response' };
  }
  return {
    ok: true,
    session: { access_token: accessToken, refresh_token: refreshToken, user_id: userId },
  };
}
