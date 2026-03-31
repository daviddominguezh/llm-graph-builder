// GitHub Tree API — recursive fetch with BFS fallback on truncation
import type { RateLimitInfo, TreeEntry } from '../types.js';
import { VFSError, VFSErrorCode } from '../types.js';
import { githubFetch } from './githubHttp.js';
import type {
  GitHubSourceConfig,
  GitHubTreeItem,
  GitHubTreeResponse,
  ParsedRateLimit,
} from './githubTypes.js';
import { validateTreeResponse } from './githubTypes.js';

const MAX_BFS_DEPTH = 20;
const INITIAL_DEPTH = 0;
const DEPTH_INCREMENT = 1;
const EMPTY_QUEUE = 0;

// ─── Result type ─────────────────────────────────────────────────────────────

export interface FetchTreeResult {
  entries: TreeEntry[];
  pathToSha: Map<string, string>;
}

// ─── Item mapping ────────────────────────────────────────────────────────────

function mapItemType(ghType: 'blob' | 'tree'): 'file' | 'directory' {
  return ghType === 'blob' ? 'file' : 'directory';
}

function buildFullPath(prefix: string, itemPath: string): string {
  return prefix === '' ? itemPath : `${prefix}/${itemPath}`;
}

function mapSingleItem(item: GitHubTreeItem, prefix: string): TreeEntry {
  const fullPath = buildFullPath(prefix, item.path);
  const type = mapItemType(item.type);
  const sizeBytes = item.type === 'blob' ? item.size : undefined;
  return { path: fullPath, type, sha: item.sha, sizeBytes };
}

export function mapTreeItems(items: GitHubTreeItem[], prefix = ''): FetchTreeResult {
  const entries: TreeEntry[] = [];
  const pathToSha = new Map<string, string>();
  for (const item of items) {
    const entry = mapSingleItem(item, prefix);
    entries.push(entry);
    if (item.type === 'blob') {
      pathToSha.set(entry.path, item.sha);
    }
  }
  return { entries, pathToSha };
}

// ─── Rate limit update helper ────────────────────────────────────────────────

function applyRateLimit(target: RateLimitInfo, parsed: ParsedRateLimit): void {
  Object.assign(target, {
    remaining: parsed.remaining,
    resetAt: parsed.resetAt,
    limit: parsed.limit,
  });
}

// ─── Tree URL builders ───────────────────────────────────────────────────────

function recursiveTreeUrl(config: GitHubSourceConfig): string {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/git/trees/${config.commitSha}?recursive=1`;
}

function treeUrl(config: GitHubSourceConfig, sha: string): string {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/git/trees/${sha}`;
}

// ─── BFS types ───────────────────────────────────────────────────────────────

interface BfsQueueItem {
  sha: string;
  prefix: string;
  depth: number;
}

interface BfsState {
  entries: TreeEntry[];
  pathToSha: Map<string, string>;
  queue: BfsQueueItem[];
}

// ─── BFS fallback ────────────────────────────────────────────────────────────

async function fetchSingleTree(
  config: GitHubSourceConfig,
  sha: string,
  rateLimit: RateLimitInfo
): Promise<GitHubTreeResponse> {
  const result = await githubFetch<GitHubTreeResponse>(
    { token: config.token, url: treeUrl(config, sha), commitSha: config.commitSha },
    validateTreeResponse
  );
  applyRateLimit(rateLimit, result.rateLimit);
  return result.data;
}

function processBfsItems(items: GitHubTreeItem[], current: BfsQueueItem, state: BfsState): void {
  for (const item of items) {
    const entry = mapSingleItem(item, current.prefix);
    state.entries.push(entry);
    if (item.type === 'blob') {
      state.pathToSha.set(entry.path, item.sha);
    }
    if (item.type === 'tree') {
      state.queue.push({ sha: item.sha, prefix: entry.path, depth: current.depth + DEPTH_INCREMENT });
    }
  }
}

async function processBfsNode(
  config: GitHubSourceConfig,
  rateLimit: RateLimitInfo,
  state: BfsState
): Promise<void> {
  const current = state.queue.shift();
  if (current === undefined) return;
  if (current.depth > MAX_BFS_DEPTH) {
    throw new VFSError(VFSErrorCode.TOO_LARGE, 'Repository tree exceeds maximum depth of 20 levels.');
  }
  const treeData = await fetchSingleTree(config, current.sha, rateLimit);
  processBfsItems(treeData.tree, current, state);
}

async function bfsFetchTree(config: GitHubSourceConfig, rateLimit: RateLimitInfo): Promise<FetchTreeResult> {
  const state: BfsState = {
    entries: [],
    pathToSha: new Map<string, string>(),
    queue: [{ sha: config.commitSha, prefix: '', depth: INITIAL_DEPTH }],
  };
  return await drainBfsQueue(config, rateLimit, state);
}

async function drainBfsQueue(
  config: GitHubSourceConfig,
  rateLimit: RateLimitInfo,
  state: BfsState
): Promise<FetchTreeResult> {
  if (state.queue.length === EMPTY_QUEUE) {
    return { entries: state.entries, pathToSha: state.pathToSha };
  }
  await processBfsNode(config, rateLimit, state);
  return await drainBfsQueue(config, rateLimit, state);
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function fetchGitHubTree(
  config: GitHubSourceConfig,
  rateLimit: RateLimitInfo
): Promise<FetchTreeResult> {
  const result = await githubFetch<GitHubTreeResponse>(
    { token: config.token, url: recursiveTreeUrl(config), commitSha: config.commitSha },
    validateTreeResponse
  );
  applyRateLimit(rateLimit, result.rateLimit);
  if (!result.data.truncated) {
    return mapTreeItems(result.data.tree);
  }
  return await bfsFetchTree(config, rateLimit);
}
