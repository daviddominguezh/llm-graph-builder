// GitHub Blob API — fetch file content as raw binary via blob SHA
import type { RateLimitInfo } from '../types.js';
import { VFSError, VFSErrorCode } from '../types.js';
import { githubFetchRaw } from './githubHttp.js';
import type { GitHubSourceConfig, ParsedRateLimit } from './githubTypes.js';

// ─── Rate limit update helper ────────────────────────────────────────────────

function applyRateLimit(target: RateLimitInfo, parsed: ParsedRateLimit): void {
  Object.assign(target, {
    remaining: parsed.remaining,
    resetAt: parsed.resetAt,
    limit: parsed.limit,
  });
}

// ─── URL builder ─────────────────────────────────────────────────────────────

function blobUrl(config: GitHubSourceConfig, sha: string): string {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/git/blobs/${sha}`;
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validatePathToSha(pathToSha: Map<string, string> | null): asserts pathToSha is Map<string, string> {
  if (pathToSha === null) {
    throw new VFSError(
      VFSErrorCode.INVALID_PARAMETER,
      'fetchTree() must be called before fetchFileContent()'
    );
  }
}

function lookupBlobSha(pathToSha: Map<string, string>, path: string): string {
  const sha = pathToSha.get(path);
  if (sha === undefined) {
    throw new VFSError(VFSErrorCode.FILE_NOT_FOUND, `File not found in tree: ${path}`);
  }
  return sha;
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function fetchGitHubBlob(
  config: GitHubSourceConfig,
  rateLimit: RateLimitInfo,
  pathToSha: Map<string, string> | null,
  path: string
): Promise<Uint8Array> {
  validatePathToSha(pathToSha);
  const sha = lookupBlobSha(pathToSha, path);
  const url = blobUrl(config, sha);
  const result = await githubFetchRaw({
    token: config.token,
    url,
    acceptRaw: true,
    commitSha: config.commitSha,
  });
  applyRateLimit(rateLimit, result.rateLimit);
  return result.data;
}
