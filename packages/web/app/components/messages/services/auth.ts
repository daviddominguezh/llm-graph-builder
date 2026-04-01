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
  return 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjVlODJhZmI0ZWY2OWI3NjM4MzA2OWFjNmI1N2U3ZTY1MjAzYmZlOTYiLCJ0eXAiOiJKV1QifQ.eyJwaWN0dXJlIjoiaHR0cHM6Ly9maXJlYmFzZXN0b3JhZ2UuZ29vZ2xlYXBpcy5jb20vdjAvYi9zeW5hcC03NGRiNy5maXJlYmFzZXN0b3JhZ2UuYXBwL28vbmlrZSUyRnByb2ZpbGVzJTJGcHJvZmlsZS0xNzYzODY1MDc1MzIyLWx1aXNhX3BpYy5qcGc_YWx0PW1lZGlhJnRva2VuPWQ5MGIxOWNkLWViZDUtNDg0Yy1iNGM2LTM3MTVjZTY1YzAyNiIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9zeW5hcC03NGRiNyIsImF1ZCI6InN5bmFwLTc0ZGI3IiwiYXV0aF90aW1lIjoxNzc0OTk0NDUzLCJ1c2VyX2lkIjoiZjF1SFRGNFRzak16U0FMNXI4aFBtNk43bFpvMSIsInN1YiI6ImYxdUhURjRUc2pNelNBTDVyOGhQbTZON2xabzEiLCJpYXQiOjE3NzUwNTU1OTUsImV4cCI6MTc3NTA1OTE5NSwiZW1haWwiOiJsdWlzYUByZXBzeS5jbyIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyJsdWlzYUByZXBzeS5jbyJdfSwic2lnbl9pbl9wcm92aWRlciI6InBhc3N3b3JkIn19.0dUlf8RugjYY5Lmuf4Cg9dAXiv-WCCDeqnGIaq1e1UK42QxhG3KNyFlY4FlWhVrS2Y9ChzbZrAd9P79WV6tPUINCLwTEcQFxLq1p7QgydUrncvDpt3hsdMO_UFyKHHXx6hv2ngV2xMUSfNuWk1QnskZcqCUwFaUSoR0UjMDeIjQXOE52HoCAmwMqhK2N9Qt-y0qNWACIhLjw5Isf-Px6ZTeTtFCAzwDsHTL0AsdGzXsj21r3jizt2iVzpvKgQ86E6S8wuGOeT6QrsSXdpvxrG8grvoUXVf2Z6ii8mevYjCVqwowfwtZK3DQO8xZT9V06YV1rzuZoy5G2WTdHrUS8gA';
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
