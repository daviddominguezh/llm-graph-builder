const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const STATUS_TIMEOUT_MS = 3000;

export interface AuthFlags {
  phone_verified: boolean;
  onboarding_completed: boolean;
}

export async function fetchAuthStatus(accessToken: string): Promise<AuthFlags | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null) return null;
    const b = body as Record<string, unknown>;
    if (typeof b.phone_verified !== 'boolean' || typeof b.onboarding_completed !== 'boolean') return null;
    return { phone_verified: b.phone_verified, onboarding_completed: b.onboarding_completed };
  } catch {
    return null;
  }
}
