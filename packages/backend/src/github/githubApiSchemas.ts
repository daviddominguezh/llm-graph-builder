import { z } from 'zod';

import type {
  GitHubAccessTokenResponse,
  GitHubInstallationResponse,
  GitHubRepoListResponse,
} from './types.js';

/* ------------------------------------------------------------------ */
/*  GitHub API response schemas                                        */
/* ------------------------------------------------------------------ */

const GitHubAccountSchema = z.object({
  login: z.string(),
  id: z.number(),
  type: z.enum(['Organization', 'User']),
});

const GitHubInstallationSchema = z.object({
  id: z.number(),
  account: GitHubAccountSchema,
  app_id: z.number(),
  target_type: z.string(),
  permissions: z.record(z.string(), z.string()),
  events: z.array(z.string()),
  suspended_at: z.string().nullable(),
});

const GitHubAccessTokenSchema = z.object({
  token: z.string(),
  expires_at: z.string(),
  permissions: z.record(z.string(), z.string()),
});

const GitHubRepoSchema = z.object({
  id: z.number(),
  full_name: z.string(),
  private: z.boolean(),
});

const GitHubRepoListSchema = z.object({
  total_count: z.number(),
  repositories: z.array(GitHubRepoSchema),
});

/* ------------------------------------------------------------------ */
/*  Parsers                                                            */
/* ------------------------------------------------------------------ */

export function parseInstallationResponse(data: unknown): GitHubInstallationResponse {
  return GitHubInstallationSchema.parse(data);
}

export function parseAccessTokenResponse(data: unknown): GitHubAccessTokenResponse {
  return GitHubAccessTokenSchema.parse(data);
}

export function parseRepoListResponse(data: unknown): GitHubRepoListResponse {
  return GitHubRepoListSchema.parse(data);
}
