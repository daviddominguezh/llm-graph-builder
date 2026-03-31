import type { SupabaseClient } from '@supabase/supabase-js';

const GITHUB_API_BASE = 'https://api.github.com';
const ACCEPT_HEADER = 'application/vnd.github+json';
const API_VERSION = '2022-11-28';
const EXPECTED_PARTS = 2;

/* ------------------------------------------------------------------ */
/*  Repo name splitting                                                */
/* ------------------------------------------------------------------ */

export interface RepoOwnerName {
  owner: string;
  repo: string;
}

export function splitRepoFullName(fullName: string): RepoOwnerName {
  const parts = fullName.split('/');
  if (parts.length < EXPECTED_PARTS) {
    throw new Error(`Invalid repo full name: ${fullName}`);
  }
  const [owner, repo] = parts;
  if (owner === undefined || repo === undefined) {
    throw new Error(`Invalid repo full name: ${fullName}`);
  }
  return { owner, repo };
}

/* ------------------------------------------------------------------ */
/*  GitHub API calls                                                   */
/* ------------------------------------------------------------------ */

function buildGitHubHeaders(token: string): Record<string, string> {
  return {
    Accept: ACCEPT_HEADER,
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION,
  };
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function isCommitResponse(val: unknown): val is { sha: string } {
  return isRecord(val) && typeof val.sha === 'string';
}

export async function resolveCommitSha(
  token: string,
  owner: string,
  repo: string,
  ref?: string
): Promise<string> {
  const resolvedRef = ref ?? (await fetchDefaultBranch(token, owner, repo));
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${resolvedRef}`;
  const response = await fetch(url, { headers: buildGitHubHeaders(token) });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to resolve commit SHA: ${text}`);
  }

  const data: unknown = await response.json();
  if (!isCommitResponse(data)) {
    throw new Error('No SHA in commit response');
  }
  return data.sha;
}

function isRepoResponse(val: unknown): val is { default_branch: string } {
  return isRecord(val) && typeof val.default_branch === 'string';
}

async function fetchDefaultBranch(token: string, owner: string, repo: string): Promise<string> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
  const response = await fetch(url, { headers: buildGitHubHeaders(token) });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch repo info: ${text}`);
  }

  const data: unknown = await response.json();
  if (!isRepoResponse(data)) {
    throw new Error('No default branch in repo response');
  }
  return data.default_branch;
}

/* ------------------------------------------------------------------ */
/*  Slug resolution                                                    */
/* ------------------------------------------------------------------ */

interface SlugRow {
  slug: string;
}

function isSlugRow(val: unknown): val is SlugRow {
  return typeof val === 'object' && val !== null && 'slug' in val;
}

export async function fetchOrgSlug(supabase: SupabaseClient, orgId: string): Promise<string> {
  const { data, error } = await supabase.from('organizations').select('slug').eq('id', orgId).single();

  if (error !== null) throw new Error(`Failed to fetch org slug: ${error.message}`);
  if (!isSlugRow(data)) throw new Error('Org slug not found');
  return data.slug;
}

export async function fetchAgentSlug(supabase: SupabaseClient, agentId: string): Promise<string> {
  const { data, error } = await supabase.from('agents').select('slug').eq('id', agentId).single();

  if (error !== null) throw new Error(`Failed to fetch agent slug: ${error.message}`);
  if (!isSlugRow(data)) throw new Error('Agent slug not found');
  return data.slug;
}
