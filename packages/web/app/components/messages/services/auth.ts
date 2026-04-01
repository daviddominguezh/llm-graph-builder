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
 * Retrieve the current auth token.
 */
export const getAuthToken = async (): Promise<string | null> => {
  return 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjVlODJhZmI0ZWY2OWI3NjM4MzA2OWFjNmI1N2U3ZTY1MjAzYmZlOTYiLCJ0eXAiOiJKV1QifQ.eyJwaWN0dXJlIjoiaHR0cHM6Ly9maXJlYmFzZXN0b3JhZ2UuZ29vZ2xlYXBpcy5jb20vdjAvYi9zeW5hcC03NGRiNy5maXJlYmFzZXN0b3JhZ2UuYXBwL28vbmlrZSUyRnByb2ZpbGVzJTJGcHJvZmlsZS0xNzYzODY1MDc1MzIyLWx1aXNhX3BpYy5qcGc_YWx0PW1lZGlhJnRva2VuPWQ5MGIxOWNkLWViZDUtNDg0Yy1iNGM2LTM3MTVjZTY1YzAyNiIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9zeW5hcC03NGRiNyIsImF1ZCI6InN5bmFwLTc0ZGI3IiwiYXV0aF90aW1lIjoxNzc0OTk0NDUzLCJ1c2VyX2lkIjoiZjF1SFRGNFRzak16U0FMNXI4aFBtNk43bFpvMSIsInN1YiI6ImYxdUhURjRUc2pNelNBTDVyOGhQbTZON2xabzEiLCJpYXQiOjE3NzUwNTQ1NzUsImV4cCI6MTc3NTA1ODE3NSwiZW1haWwiOiJsdWlzYUByZXBzeS5jbyIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyJsdWlzYUByZXBzeS5jbyJdfSwic2lnbl9pbl9wcm92aWRlciI6InBhc3N3b3JkIn19.OZcCKfJB0FOMAqCdPfgFSzc6RFU0J4EXjROB8GDSVQY7KD34GsfxNko0SioS2CHijMroGJbxv29IcJhUeuPjmwfANrKs77XSk0FRrryWF0CS2MVPiEiQUxEgNADgackS3W_27dwThU6Rp2nY9wp3HD1VMaofrXiPfT-2TftGOegRfwpzPnrhmgayMJgZ4zs5xt4SARIvsIZ_2p_PYunyWXoi_GZP6qjQISm9H0-c7L1ddVvUaYVpBPFOR4x1oc7ZIpo4RyjUDp007H_rtdVIPbs8r2oTau8QUPIgz8cwY6FQOuepVuiquU6CGMJIWmUKPfh5nnfFfXJDC8WPXZEHtw';
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
