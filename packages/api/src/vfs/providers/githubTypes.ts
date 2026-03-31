// GitHub API types and configuration for the GitHubSourceProvider

export interface GitHubSourceConfig {
  token: string;
  owner: string;
  repo: string;
  commitSha: string;
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export interface GitHubErrorBody {
  message: string;
  errors?: Array<{ code?: string; message?: string }>;
  documentation_url?: string;
}

export interface ParsedRateLimit {
  remaining: number;
  resetAt: Date;
  limit: number;
}

export interface GitHubFetchResult<T> {
  data: T;
  rateLimit: ParsedRateLimit;
}

export interface GitHubRequestOptions {
  token: string;
  url: string;
  acceptRaw?: boolean;
  commitSha: string;
  timeoutMs?: number;
}

// ─── Type guards / validators ────────────────────────────────────────────────

function isTreeResponse(raw: unknown): raw is GitHubTreeResponse {
  return typeof raw === 'object' && raw !== null && 'tree' in raw && 'truncated' in raw;
}

export function validateTreeResponse(raw: unknown): GitHubTreeResponse {
  if (isTreeResponse(raw)) return raw;
  return { sha: '', url: '', tree: [], truncated: false };
}

export function validateUnknown(raw: unknown): unknown {
  return raw;
}
