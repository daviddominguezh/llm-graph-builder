import { createAgentScopedRateLimiter } from './agentScopedRateLimiter.js';

const STORE_BINDINGS_LIMIT = 30;
const STORE_BINDINGS_WINDOW_MS = 60_000;

export const storeBindingsLimiter = createAgentScopedRateLimiter(
  STORE_BINDINGS_LIMIT,
  STORE_BINDINGS_WINDOW_MS
);
