import { createAgentScopedRateLimiter } from './agentScopedRateLimiter.js';

const SELECTED_TOOLS_LIMIT = 30;
const SELECTED_TOOLS_WINDOW_MS = 60_000;

export const selectedToolsLimiter = createAgentScopedRateLimiter(
  SELECTED_TOOLS_LIMIT,
  SELECTED_TOOLS_WINDOW_MS
);
