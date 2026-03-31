# GitHub Source Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement `GitHubSourceProvider`, a `SourceProvider` implementation that fetches repository trees and file contents from the GitHub API, with robust error handling, rate limit tracking, and retry logic.
**Architecture:** The provider lives in `packages/api/src/vfs/providers/` as a standalone module that implements the `SourceProvider` interface from `types.ts`. It uses Deno-native `fetch` (also available in Node 18+ for tests) with no external HTTP dependencies. The class is constructor-injected with a token, owner, repo, and pinned commitSha, and exposes `fetchTree()` and `fetchFileContent(path)`.
**Tech Stack:** TypeScript (strict, ESM), Deno-native `fetch`, Jest (Node 18+) for tests with mocked `globalThis.fetch`.
**Spec:** `docs/superpowers/specs/2026-03-30-github-source-provider-design.md`
**Depends on:** Spec 1 (VFS Core) -- `SourceProvider`, `TreeEntry`, `RateLimitInfo`, `VFSError`, `VFSErrorCode` from `packages/api/src/vfs/types.ts`
**ESLint constraints:** max 40 lines/function, max 300 lines/file, max depth 2.

---

## File Structure

```
packages/api/src/vfs/providers/
  githubTypes.ts                  -- CREATE: GitHub API response types, config interface
  githubHttp.ts                   -- CREATE: HTTP client wrapper (fetch, headers, timeout, retry, rate limit parsing, error mapping)
  githubTree.ts                   -- CREATE: fetchTree logic (recursive + BFS fallback)
  githubBlob.ts                   -- CREATE: fetchFileContent logic (blob SHA lookup + raw fetch)
  githubSourceProvider.ts         -- CREATE: GitHubSourceProvider class (assembles everything)
  index.ts                        -- CREATE: re-exports GitHubSourceProvider
  __tests__/
    githubHttp.test.ts            -- CREATE: tests for HTTP wrapper
    githubTree.test.ts            -- CREATE: tests for fetchTree
    githubBlob.test.ts            -- CREATE: tests for fetchFileContent
    githubSourceProvider.test.ts  -- CREATE: integration tests for the full class
    fetchMock.ts                  -- CREATE: shared fetch mock helpers

packages/api/src/vfs/index.ts    -- MODIFY: add export for GitHubSourceProvider
```

---

### Task 1: GitHub API types and fetch mock helpers

**Files:** create `providers/githubTypes.ts`, create `providers/__tests__/fetchMock.ts`

- [ ] Create `githubTypes.ts` with the following types:

```typescript
// GitHubSourceConfig -- constructor config for the provider
export interface GitHubSourceConfig {
  token: string;       // installation access token
  owner: string;       // repo owner (org or user)
  repo: string;        // repo name
  commitSha: string;   // pinned SHA
}

// GitHub Git Trees API response shape
export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;       // only present for blobs
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

// GitHub error response body
export interface GitHubErrorBody {
  message: string;
  errors?: Array<{ code?: string; message?: string }>;
  documentation_url?: string;
}

// Parsed rate limit from response headers
export interface ParsedRateLimit {
  remaining: number;
  resetAt: Date;
  limit: number;
}

// Internal result from githubFetch wrapper
export interface GitHubFetchResult<T> {
  data: T;
  rateLimit: ParsedRateLimit;
}
```

- [ ] Create `__tests__/fetchMock.ts` with shared mock helpers:

```typescript
// Helper to build a mock Response with headers and JSON body
export function mockResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>
): Response;

// Helper to build rate limit headers
// Takes remaining, resetEpochSeconds, limit and returns a headers Record
export function rateLimitHeaders(
  remaining: number,
  resetEpoch: number,
  limit: number
): Record<string, string>;

// Helper to build a mock Response for raw blob content (ArrayBuffer body)
export function mockBlobResponse(
  status: number,
  content: Uint8Array,
  headers?: Record<string, string>
): Response;
```

The `mockResponse` helper constructs a `new Response(JSON.stringify(body), { status, headers })`. The `rateLimitHeaders` helper returns `{ 'x-ratelimit-remaining': String(remaining), 'x-ratelimit-reset': String(resetEpoch), 'x-ratelimit-limit': String(limit) }`. The `mockBlobResponse` constructs `new Response(content.buffer, { status, headers })`.

- [ ] Verify: `npm run typecheck -w packages/api` passes.

---

### Task 2: GitHub HTTP client wrapper

**Files:** create `providers/githubHttp.ts`, create `providers/__tests__/githubHttp.test.ts`

This is the core HTTP layer. Every GitHub API call goes through this wrapper, which handles headers, timeout, retry, rate limit parsing, and error mapping.

- [ ] Write tests first in `__tests__/githubHttp.test.ts`. Tests mock `globalThis.fetch` using `jest.spyOn(globalThis, 'fetch')`. After each test, restore with `fetchSpy.mockRestore()`. Tests to write:

  1. **Sets correct headers for JSON requests** -- verify `Authorization: Bearer {token}`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28` are sent.
  2. **Sets raw Accept header for blob requests** -- when called with `acceptRaw: true`, verify `Accept: application/vnd.github.raw+json`.
  3. **Parses rate limit from response headers** -- mock response with `x-ratelimit-remaining: 4500`, `x-ratelimit-reset: 1700000000`, `x-ratelimit-limit: 5000`. Assert returned `rateLimit` equals `{ remaining: 4500, resetAt: new Date(1700000000 * 1000), limit: 5000 }`.
  4. **Handles missing rate limit headers gracefully** -- when headers are absent, returned `rateLimit` should be `{ remaining: Infinity, resetAt: new Date(0), limit: Infinity }` (i.e., no update if headers missing).
  5. **Maps 401 to PERMISSION_DENIED** -- mock 401 response, assert `VFSError` thrown with code `PERMISSION_DENIED` and message containing "revoked".
  6. **Maps 403 + ratelimit-remaining 0 to RATE_LIMITED** -- mock 403 with `x-ratelimit-remaining: 0` and `x-ratelimit-reset` set to a future epoch. Assert `VFSError` with `RATE_LIMITED` and message containing "resets in".
  7. **Maps 403 + retry-after to RATE_LIMITED (secondary)** -- mock 403 with `retry-after: 60` header (no ratelimit-remaining: 0). Assert `VFSError` with `RATE_LIMITED` and message containing "secondary" and "60".
  8. **Maps 403 + errors[].code too_large to TOO_LARGE** -- mock 403 with body `{ message: "...", errors: [{ code: "too_large" }] }` (no rate limit headers triggering). Assert `VFSError` with `TOO_LARGE`.
  9. **Maps 403 (generic) to PERMISSION_DENIED** -- mock 403 with no special headers or body codes. Assert `VFSError` with `PERMISSION_DENIED` and message containing "permissions".
  10. **Maps 404 to FILE_NOT_FOUND** -- assert message contains commit SHA.
  11. **Maps 422 to INVALID_PARAMETER** -- assert message contains "commit SHA".
  12. **Maps 429 to RATE_LIMITED** -- mock 429 with `retry-after: 30`. Assert message contains "secondary" and "30".
  13. **Maps 5xx to PROVIDER_ERROR after one retry** -- mock fetch to return 502 twice. Assert `VFSError` with `PROVIDER_ERROR`. Verify `fetch` was called exactly 2 times (initial + 1 retry).
  14. **Retries once on network error** -- mock fetch to throw `TypeError('fetch failed')` then return 200. Assert the call succeeds (retry worked). Verify fetch called 2 times.
  15. **Does not retry on 4xx** -- mock 400 response. Assert fetch called exactly once.
  16. **Timeout via AbortSignal** -- mock fetch that never resolves (hangs). Pass a short timeout. Assert `VFSError` with `PROVIDER_ERROR` and message mentioning "timeout". Use `AbortSignal.timeout()` if available or `setTimeout` + `AbortController`.

- [ ] Implement `githubHttp.ts` with the following exports:

```typescript
// Parse rate limit headers from a Response
export function parseRateLimit(headers: Headers): ParsedRateLimit;
```

Implementation: read `x-ratelimit-remaining`, `x-ratelimit-reset`, `x-ratelimit-limit` from `headers.get(...)`. Parse with `Number(...)`. If `NaN` or missing, use defaults (`Infinity` for remaining/limit, `new Date(0)` for resetAt). For `resetAt`, multiply epoch seconds by 1000: `new Date(Number(value) * 1000)`.

```typescript
// Compute "resets in N minutes" from a reset Date
export function formatResetDuration(resetAt: Date): string;
```

Implementation: `const diffMs = resetAt.getTime() - Date.now()`. If `diffMs <= 0`, return `"now"`. Otherwise compute minutes: `Math.ceil(diffMs / 60000)` and return `"${minutes} minute(s)"`.

```typescript
// Map a GitHub error response to a VFSError (does not throw -- returns the error)
export function mapGitHubError(
  status: number,
  headers: Headers,
  body: GitHubErrorBody,
  commitSha: string
): VFSError;
```

Implementation -- 403 discrimination order matters:
1. Check `headers.get('x-ratelimit-remaining') === '0'` --> `RATE_LIMITED`, message: `"GitHub API rate limit exceeded. Resets in ${formatResetDuration(resetAt)}."` where resetAt is parsed from `x-ratelimit-reset`.
2. Check `headers.get('retry-after')` is present --> `RATE_LIMITED`, message: `"GitHub API secondary rate limit. Retry after ${retryAfter} seconds."`
3. Check `body.errors?.some(e => e.code === 'too_large')` --> `TOO_LARGE`, message: `"File exceeds GitHub's 100 MB blob API limit."`
4. Fallthrough --> `PERMISSION_DENIED`, message: `"GitHub App may be missing required permissions for this operation."`

Other status codes:
- `401` --> `PERMISSION_DENIED`, message: `"GitHub access has been revoked. Please reconnect your repository."`
- `404` --> `FILE_NOT_FOUND`, message: `"File not found in repository at commit ${commitSha}."`
- `422` --> `INVALID_PARAMETER`, message: `"Invalid or missing commit SHA: ${commitSha}. Ensure the commit exists."`
- `429` --> `RATE_LIMITED`, message: `"GitHub API rate limit exceeded (secondary). Retry after ${retryAfter} seconds."` where `retryAfter = headers.get('retry-after') ?? 'unknown'`.
- `status >= 500` --> `PROVIDER_ERROR`, message: `"GitHub API error: ${status} ${body.message}"`

```typescript
// Options for a single GitHub API call
export interface GitHubRequestOptions {
  token: string;
  url: string;
  acceptRaw?: boolean;      // use raw+json Accept header (for blobs)
  commitSha: string;        // for error messages
  timeoutMs?: number;       // default 30_000
}

// Main fetch wrapper -- handles headers, timeout, retry, error mapping
export async function githubFetch<T>(options: GitHubRequestOptions): Promise<GitHubFetchResult<T>>;
```

Implementation of `githubFetch`:
1. Build headers: `Authorization: Bearer ${token}`, `Accept` based on `acceptRaw`, `X-GitHub-Api-Version: 2022-11-28`.
2. Create `AbortSignal.timeout(timeoutMs)` (Node 18+ / Deno support this).
3. Call `fetch(url, { headers, signal })`.
4. If fetch throws (network error or abort), set `lastError` and proceed to retry logic.
5. If response status >= 500, set `lastError` as the mapped VFSError and proceed to retry.
6. If response status >= 400 (4xx), parse body as JSON, call `mapGitHubError`, throw immediately (no retry for client errors).
7. If response status 2xx, parse rate limit from headers, parse body as JSON (or return raw response for blobs), return `{ data, rateLimit }`.
8. Retry logic: wrap in a loop with `maxAttempts = 2`. On first failure (5xx or network), wait 1 second (`await new Promise(r => setTimeout(r, 1000))`), then retry. If second attempt also fails, throw the `lastError`.

To stay under 40 lines/function, split into helpers:
- `buildHeaders(token: string, acceptRaw: boolean): HeadersInit`
- `attemptFetch(url: string, headers: HeadersInit, signal: AbortSignal): Promise<Response>` -- just the fetch call wrapped in try/catch for network errors
- `handleErrorResponse(response: Response, commitSha: string): Promise<VFSError>` -- reads body, calls mapGitHubError
- `githubFetch` orchestrates: loop, call attemptFetch, check status, handle error or success.

- [ ] Run tests: `npm run test -w packages/api -- --testPathPattern=githubHttp`
- [ ] Verify: `npm run typecheck -w packages/api`

---

### Task 3: fetchTree implementation (recursive + BFS fallback)

**Files:** create `providers/githubTree.ts`, create `providers/__tests__/githubTree.test.ts`

- [ ] Write tests first in `__tests__/githubTree.test.ts`. Mock `githubFetch` using `jest.unstable_mockModule` (ESM-compatible mocking). Tests to write:

  1. **Recursive success (not truncated)** -- mock `githubFetch` to return a `GitHubTreeResponse` with `truncated: false` and a flat list of items (mix of blobs and trees). Assert returned `TreeEntry[]` has correct path, type mapping (`blob` -> `'file'`, `tree` -> `'directory'`), sizeBytes, and sha. Assert `githubFetch` called exactly once.
  2. **Recursive truncated triggers BFS fallback** -- mock first call to return `truncated: true`. Mock subsequent non-recursive calls for root tree and each subtree. Assert all entries are collected across BFS levels. Assert the number of `githubFetch` calls equals 1 (failed recursive) + 1 (root) + number of subtrees.
  3. **BFS fallback respects max depth 20** -- mock a chain of trees where every level has one subtree child, 21 levels deep. Assert `VFSError` with `TOO_LARGE` is thrown when depth exceeds 20.
  4. **BFS correctly builds full paths** -- mock root tree with `dir-a` (tree) and `file-b` (blob). Mock `dir-a` subtree with `nested.ts` (blob). Assert returned entries include `dir-a/nested.ts` with type `'file'`.
  5. **Rate limit updated from every API call** -- provide a mutable `RateLimitInfo` object. After the call, assert it was updated with the rate limit from the last response.
  6. **Empty repository (no tree items)** -- mock response with empty `tree: []`. Assert returns empty `TreeEntry[]`.
  7. **pathToSha map is populated correctly** -- this is internal state. Test indirectly by verifying that after `fetchTree`, the returned `Map<string, string>` contains blob paths mapped to their SHAs.

- [ ] Implement `githubTree.ts` with the following exports:

```typescript
// Result of fetchTree including the internal path-to-SHA map
export interface FetchTreeResult {
  entries: TreeEntry[];
  pathToSha: Map<string, string>;
}

// Main entry point
export async function fetchGitHubTree(
  config: GitHubSourceConfig,
  rateLimit: RateLimitInfo
): Promise<FetchTreeResult>;
```

Implementation detail -- `fetchGitHubTree`:
1. Call `githubFetch<GitHubTreeResponse>` with URL: `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`.
2. Update `rateLimit` fields in-place from the response's `rateLimit`.
3. If `response.data.truncated === false`, call `mapTreeItems(response.data.tree)` and return.
4. If truncated, call `bfsFetchTree(config, rateLimit)`.

```typescript
// Map GitHub tree items to TreeEntry[] and build pathToSha map
export function mapTreeItems(
  items: GitHubTreeItem[],
  prefix?: string
): FetchTreeResult;
```

Implementation: iterate items. For each, compute `fullPath = prefix ? `${prefix}/${item.path}` : item.path`. Map `type`: `'blob'` -> `'file'`, `'tree'` -> `'directory'`. Set `sizeBytes` from `item.size` (only for blobs). Set `sha` from `item.sha`. For blobs, add to `pathToSha` map.

```typescript
// BFS fallback when recursive tree is truncated
async function bfsFetchTree(
  config: GitHubSourceConfig,
  rateLimit: RateLimitInfo
): Promise<FetchTreeResult>;
```

Implementation:
1. Initialize `queue: Array<{ sha: string; prefix: string; depth: number }>` with `[{ sha: config.commitSha, prefix: '', depth: 0 }]`.
2. Initialize `allEntries: TreeEntry[] = []` and `pathToSha = new Map<string, string>()`.
3. While queue is not empty, dequeue the first item.
4. If `depth > 20`, throw `new VFSError(VFSErrorCode.TOO_LARGE, 'Repository tree exceeds maximum depth of 20 levels.')`.
5. Fetch non-recursive: `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}` (no `?recursive=1`).
6. Update `rateLimit` in-place.
7. For each item in response: compute `fullPath`, map type, add to `allEntries`. If type is `'tree'`, enqueue `{ sha: item.sha, prefix: fullPath, depth: depth + 1 }`. If type is `'blob'`, add to `pathToSha`.
8. Return `{ entries: allEntries, pathToSha }`.

To stay under 40 lines/function, extract:
- `mapTreeItems` as a pure function (separate export, testable independently)
- `processBfsLevel` or inline the item-mapping into `mapTreeItems` with prefix param
- `bfsFetchTree` calls `githubFetch` in a loop, delegates item mapping

- [ ] Run tests: `npm run test -w packages/api -- --testPathPattern=githubTree`
- [ ] Verify: `npm run typecheck -w packages/api`

---

### Task 4: fetchFileContent implementation (blob fetch)

**Files:** create `providers/githubBlob.ts`, create `providers/__tests__/githubBlob.test.ts`

- [ ] Write tests first in `__tests__/githubBlob.test.ts`. Tests to write:

  1. **Fetches blob content as Uint8Array** -- provide a `pathToSha` map with `"src/app.ts"` -> `"abc123"`. Mock `githubFetch` to return a `Response` with binary content. Assert returned `Uint8Array` matches expected bytes.
  2. **Throws INVALID_PARAMETER if pathToSha is null (fetchTree not called)** -- pass `null` for pathToSha. Assert `VFSError` with `INVALID_PARAMETER` and message containing "fetchTree() must be called".
  3. **Throws FILE_NOT_FOUND if path not in map** -- pass a populated `pathToSha` map that does not include the requested path. Assert `VFSError` with `FILE_NOT_FOUND`.
  4. **Updates rateLimit from blob response** -- after fetch, assert `rateLimit` fields were updated.
  5. **Handles binary content correctly** -- create a `Uint8Array` with non-UTF8 bytes (e.g., `[0x00, 0xFF, 0x89, 0x50]`). Mock response. Assert byte-for-byte equality.

- [ ] Implement `githubBlob.ts` with the following export:

```typescript
export async function fetchGitHubBlob(
  config: GitHubSourceConfig,
  rateLimit: RateLimitInfo,
  pathToSha: Map<string, string> | null,
  path: string
): Promise<Uint8Array>;
```

Implementation:
1. If `pathToSha === null`, throw `new VFSError(VFSErrorCode.INVALID_PARAMETER, 'fetchTree() must be called before fetchFileContent()')`.
2. `const sha = pathToSha.get(path)`. If `undefined`, throw `new VFSError(VFSErrorCode.FILE_NOT_FOUND, `File not found in tree: ${path}`)`.
3. Build URL: `https://api.github.com/repos/${config.owner}/${config.repo}/git/blobs/${sha}`.
4. Call a specialized blob fetch function (not the JSON `githubFetch` -- we need raw binary):

For the raw blob fetch, create a helper `githubFetchRaw`:

```typescript
export async function githubFetchRaw(
  options: GitHubRequestOptions
): Promise<{ data: Uint8Array; rateLimit: ParsedRateLimit }>;
```

This is similar to `githubFetch` but:
- Sets `acceptRaw: true` in headers.
- On success, reads `response.arrayBuffer()` and wraps in `new Uint8Array(buffer)`.
- Still handles errors and retries identically (reuse `handleErrorResponse` and retry logic from `githubHttp.ts`).

Alternatively, refactor `githubFetch` to accept a `responseType: 'json' | 'raw'` parameter. If `raw`, return `Uint8Array` instead of parsed JSON. This avoids duplicating retry/error logic. Choose whichever approach keeps functions under 40 lines.

5. Update `rateLimit` in-place from the response's parsed rate limit.
6. Return the `Uint8Array`.

- [ ] Run tests: `npm run test -w packages/api -- --testPathPattern=githubBlob`
- [ ] Verify: `npm run typecheck -w packages/api`

---

### Task 5: GitHubSourceProvider class

**Files:** create `providers/githubSourceProvider.ts`, create `providers/index.ts`, create `providers/__tests__/githubSourceProvider.test.ts`

- [ ] Write integration tests first in `__tests__/githubSourceProvider.test.ts`. These tests mock `globalThis.fetch` directly (full integration through the HTTP layer). Tests to write:

  1. **Constructor sets commitSha readonly and initializes rateLimit** -- create instance, assert `provider.commitSha === config.commitSha`. Assert `provider.rateLimit` equals `{ remaining: Infinity, resetAt: new Date(0), limit: Infinity }`.
  2. **fetchTree returns TreeEntry[] and updates rateLimit** -- mock fetch for the recursive tree API. Call `provider.fetchTree()`. Assert returned array has correct entries. Assert `provider.rateLimit.remaining` is now a finite number from the mock headers.
  3. **fetchTree with truncation triggers BFS and returns complete tree** -- mock first fetch to return `truncated: true`, then mock subsequent BFS fetches. Assert all entries are returned.
  4. **fetchFileContent returns Uint8Array for known path** -- call `fetchTree()` first (mocked), then `fetchFileContent('src/app.ts')`. Assert returns expected bytes.
  5. **fetchFileContent before fetchTree throws INVALID_PARAMETER** -- call `fetchFileContent` without calling `fetchTree` first. Assert throws.
  6. **fetchFileContent for unknown path throws FILE_NOT_FOUND** -- call `fetchTree()`, then `fetchFileContent('nonexistent.ts')`. Assert throws.
  7. **rateLimit is updated after every call** -- call `fetchTree()`, note rateLimit. Call `fetchFileContent()` with different rate limit headers in mock. Assert rateLimit updated to the newer values.
  8. **401 error propagates as PERMISSION_DENIED** -- mock fetch to return 401. Call `fetchTree()`. Assert `VFSError` with `PERMISSION_DENIED`.
  9. **5xx retries once then throws PROVIDER_ERROR** -- mock fetch to return 502 twice. Assert `VFSError` with `PROVIDER_ERROR`. Assert fetch called 2 times.

- [ ] Implement `githubSourceProvider.ts`:

```typescript
import type { RateLimitInfo, SourceProvider, TreeEntry } from '../types.js';
import type { GitHubSourceConfig } from './githubTypes.js';
import { fetchGitHubBlob } from './githubBlob.js';
import { fetchGitHubTree } from './githubTree.js';

export class GitHubSourceProvider implements SourceProvider {
  readonly commitSha: string;
  rateLimit: RateLimitInfo;

  private readonly config: GitHubSourceConfig;
  private pathToSha: Map<string, string> | null = null;

  constructor(config: GitHubSourceConfig) {
    this.config = config;
    this.commitSha = config.commitSha;
    this.rateLimit = {
      remaining: Infinity,
      resetAt: new Date(0),
      limit: Infinity,
    };
  }

  async fetchTree(): Promise<TreeEntry[]> {
    const result = await fetchGitHubTree(this.config, this.rateLimit);
    this.pathToSha = result.pathToSha;
    return result.entries;
  }

  async fetchFileContent(path: string): Promise<Uint8Array> {
    return fetchGitHubBlob(
      this.config,
      this.rateLimit,
      this.pathToSha,
      path
    );
  }
}
```

This class is intentionally thin -- all logic lives in `githubTree.ts`, `githubBlob.ts`, and `githubHttp.ts`. The class just wires them together and manages the `pathToSha` state.

- [ ] Create `providers/index.ts`:

```typescript
export { GitHubSourceProvider } from './githubSourceProvider.js';
export type { GitHubSourceConfig } from './githubTypes.js';
```

- [ ] Run tests: `npm run test -w packages/api -- --testPathPattern=githubSourceProvider`
- [ ] Verify: `npm run typecheck -w packages/api`

---

### Task 6: Export from VFS index and final verification

**Files:** modify `packages/api/src/vfs/index.ts`

- [ ] Add export to `packages/api/src/vfs/index.ts`:

```typescript
export { GitHubSourceProvider } from './providers/index.js';
export type { GitHubSourceConfig } from './providers/index.js';
```

- [ ] Run full test suite: `npm run test -w packages/api`
- [ ] Run full checks: `npm run check` (format + lint + typecheck)
- [ ] Verify no ESLint violations: specifically check that no file exceeds 300 lines, no function exceeds 40 lines, and max depth of 2 is respected.
- [ ] Verify the `GitHubSourceProvider` is importable from the package entry point by checking that `packages/api/src/vfs/index.ts` exports it and it chains through to `packages/api/src/index.ts` (check if the main index re-exports VFS).

---

## Self-Review Checklist

| Spec Requirement | Task |
|---|---|
| `GitHubSourceProvider` implements `SourceProvider` | Task 5 |
| Constructor: `{ token, owner, repo, commitSha }` | Task 1 (types), Task 5 (class) |
| `readonly commitSha`, mutable `rateLimit` | Task 5 |
| Internal `pathToSha: Map<string, string>` | Task 3 (built in fetchTree), Task 5 (stored in class) |
| `fetchTree()` recursive attempt | Task 3 |
| `fetchTree()` BFS fallback on `truncated: true` | Task 3 |
| BFS max depth 20 | Task 3 |
| Map blob->file, tree->directory, size->sizeBytes, sha | Task 3 |
| `fetchFileContent()` blob SHA lookup from internal map | Task 4 |
| `fetchFileContent()` raw binary via `arrayBuffer()` -> `Uint8Array` | Task 4 |
| `fetchFileContent()` before `fetchTree()` -> `INVALID_PARAMETER` | Task 4 |
| `fetchFileContent()` unknown path -> `FILE_NOT_FOUND` | Task 4 |
| Rate limit tracking from headers after every call | Task 2, Task 3, Task 4 |
| Rate limit initialized to `{ remaining: Infinity, resetAt: new Date(0), limit: Infinity }` | Task 5 |
| Error mapping: 401 -> PERMISSION_DENIED | Task 2 |
| Error mapping: 403 + ratelimit-remaining 0 -> RATE_LIMITED | Task 2 |
| Error mapping: 403 + retry-after -> RATE_LIMITED | Task 2 |
| Error mapping: 403 + errors[].code too_large -> TOO_LARGE | Task 2 |
| Error mapping: 403 generic -> PERMISSION_DENIED | Task 2 |
| Error mapping: 404 -> FILE_NOT_FOUND | Task 2 |
| Error mapping: 422 -> INVALID_PARAMETER | Task 2 |
| Error mapping: 429 -> RATE_LIMITED | Task 2 |
| Error mapping: 5xx -> PROVIDER_ERROR | Task 2 |
| HTTP headers: Authorization, Accept, X-GitHub-Api-Version | Task 2 |
| Timeout: AbortSignal.timeout (10s connection, 30s read) | Task 2 |
| Retry: one retry on 5xx/network, 1s delay, no retry on 4xx | Task 2 |
| Deno-native fetch, no external HTTP library | Task 2 |
| Tests with mocked fetch in Node.js Jest | Tasks 2-5 |
| Files in `packages/api/src/vfs/providers/` | All tasks |
| Exported from `vfs/index.ts` | Task 6 |
| ESLint: max 40 lines/fn, 300 lines/file, depth 2 | All tasks (file split strategy) |
