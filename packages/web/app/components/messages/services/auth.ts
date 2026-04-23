/**
 * Auth service stub — placeholder authentication functions.
 *
 * These replace the real auth service that relies on Firebase
 * Authentication so the messages feature can compile and render
 * without a Firebase dependency.
 */

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

/**
 * Initialize the auth token (e.g. from stored refresh tokens).
 * Stub: resolves immediately with no effect.
 */
export const initializeToken = async (): Promise<void> => {
  /* no-op stub */
};

/**
 * Retrieve the current auth token (Supabase access token from the browser session).
 */
export const getAuthToken = async (): Promise<string | null> => {
  const { createClient } = await import('@/app/lib/supabase/client');
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
};

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/**
 * Handle an auth-related error (e.g. expired token, 401 response).
 * Stub: logs the error to the console.
 */
export const handleAuthError = (error: unknown): void => {
  console.warn('[auth stub] handleAuthError:', error);
};
