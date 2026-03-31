import {
  parseAccessTokenResponse,
  parseInstallationResponse,
  parseRepoListResponse,
} from './githubApiSchemas.js';
import type {
  GitHubAccessTokenResponse,
  GitHubInstallationResponse,
  GitHubRepoListResponse,
} from './types.js';

const GITHUB_API_BASE = 'https://api.github.com';
const ACCEPT_HEADER = 'application/vnd.github+json';
const API_VERSION = '2022-11-28';

interface FetchOptions {
  method?: string;
  token: string;
  body?: unknown;
}

/* ------------------------------------------------------------------ */
/*  Fetch helpers                                                      */
/* ------------------------------------------------------------------ */

function buildHeaders(token: string): Record<string, string> {
  return {
    Accept: ACCEPT_HEADER,
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION,
  };
}

function serializeBody(body: unknown): string | undefined {
  if (body === undefined) return undefined;
  return JSON.stringify(body);
}

function buildFetchInit(options: FetchOptions): RequestInit {
  const method = options.method ?? 'GET';
  return { method, headers: buildHeaders(options.token), body: serializeBody(options.body) };
}

async function throwOnError(response: globalThis.Response, path: string): Promise<void> {
  if (response.ok) return;
  const text = await response.text();
  throw new Error(`GitHub API ${path} failed (${String(response.status)}): ${text}`);
}

async function githubFetch(path: string, options: FetchOptions): Promise<unknown> {
  const url = `${GITHUB_API_BASE}${path}`;
  const response = await fetch(url, buildFetchInit(options));
  await throwOnError(response, path);
  return await response.json();
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch installation details using an App JWT.
 * GET /app/installations/{installation_id}
 */
export async function fetchInstallation(
  appJwt: string,
  installationId: number
): Promise<GitHubInstallationResponse> {
  const data = await githubFetch(`/app/installations/${String(installationId)}`, { token: appJwt });
  return parseInstallationResponse(data);
}

/**
 * Exchange an App JWT for an installation access token.
 * POST /app/installations/{installation_id}/access_tokens
 */
export async function createInstallationAccessToken(
  appJwt: string,
  installationId: number
): Promise<GitHubAccessTokenResponse> {
  const data = await githubFetch(`/app/installations/${String(installationId)}/access_tokens`, {
    method: 'POST',
    token: appJwt,
  });
  return parseAccessTokenResponse(data);
}

/**
 * List repositories accessible to an installation.
 * GET /installation/repositories (uses installation token, not App JWT).
 */
export async function fetchInstallationRepos(installationToken: string): Promise<GitHubRepoListResponse> {
  const data = await githubFetch('/installation/repositories?per_page=100', {
    token: installationToken,
  });
  return parseRepoListResponse(data);
}
