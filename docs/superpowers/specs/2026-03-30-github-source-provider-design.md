# Spec 3: GitHub Source Provider

Implements the `SourceProvider` interface from Spec 1 using the GitHub API. Injected into `VFSContext` at construction time. Lives in its own file — never imported by VFS core layers.

## File Layout

```
packages/api/src/vfs/
  providers/
    githubSourceProvider.ts   — GitHubSourceProvider class
    index.ts                  — exports
```

## GitHubSourceProvider

```typescript
class GitHubSourceProvider implements SourceProvider {
  readonly commitSha: string;
  rateLimit: RateLimitInfo;  // fields mutated in-place after every API call

  constructor(config: {
    token: string;        // installation access token (1-hour lifetime)
    owner: string;        // repo owner (org or user)
    repo: string;         // repo name
    commitSha: string;    // pinned SHA, resolved before construction
  });

  fetchTree(): Promise<TreeEntry[]>;
  fetchFileContent(path: string): Promise<Uint8Array>;
}
```

## Authentication

- Receives a fresh installation access token at construction. Token is minted by the backend before each agent run using the GitHub App private key + installation ID.
- No token refresh logic — a single agent run is well under the 1-hour token lifetime.
- If the token is invalid or the installation has been revoked, GitHub returns 401. The provider throws a `VFSError` with a clear message: "GitHub access has been revoked. Please reconnect your repository."

## Commit Pinning

- `commitSha` is set at construction, readonly, and used for all API calls.
- The backend resolves the branch/PR head to a concrete SHA before constructing the provider.
- Prevents inconsistent file versions if someone pushes during an agent run.

## fetchTree

Uses the GitHub Git Trees API:

1. **Try recursive:** `GET /repos/{owner}/{repo}/git/trees/{commitSha}?recursive=1`.
2. **Check truncation:** if response has `truncated: true`, fall back to non-recursive tree walking.
3. **Recursive fallback:** breadth-first walk — fetch root tree without `?recursive=1`. Each tree response includes `sha` for every entry. Newly discovered `tree`-type entries are added to the BFS queue. For each queued subtree SHA, make a non-recursive API call. Repeat until the queue is empty. Max depth: 20 levels (throws `VFSError(TOO_LARGE)` if exceeded). The recursive API (step 1) enforces its own limits server-side; the 20-level cap only applies to this manual BFS fallback.
4. **Map response** to `TreeEntry[]`: capture `path`, `type` (blob -> "file", tree -> "directory"), GitHub `size` field -> `TreeEntry.sizeBytes`, and `sha` (blob SHA for files, tree SHA for directories).
5. **Update `rateLimit`** from response headers after every API call.

The recursive fallback consumes more rate limit budget (one call per directory vs. one call total). The rate limit tracking in VFSContext naturally surfaces this.

## fetchFileContent

Uses the Git Blobs API with raw media type:

1. Look up the blob SHA for the given path (from the tree entries passed through VFSContext).
2. `GET /repos/{owner}/{repo}/git/blobs/{sha}` with `Accept: application/vnd.github.raw+json`.
3. Read response as `ArrayBuffer` via `response.arrayBuffer()`, wrap in `new Uint8Array(buffer)`. Do not use `.json()` or `.text()` (would corrupt binary content).
4. **Update `rateLimit`** from response headers.

The blob SHA comes from the tree (captured in `TreeEntry.sha` during `fetchTree`). This avoids path resolution on GitHub's side and guarantees we're reading the exact blob at the pinned commit.

The provider maintains an internal `Map<string, string>` (path -> blob SHA) built during `fetchTree()`. When `fetchFileContent(path)` is called, it looks up the SHA from this internal map. This keeps the `SourceProvider` interface clean (path-based, provider-agnostic) while allowing the GitHub implementation to use the efficient Blobs API. If `fetchFileContent` is called before `fetchTree`, it throws `VFSError(INVALID_PARAMETER, "fetchTree() must be called before fetchFileContent()")`. If called for a path not in the tree, it throws `VFSError(FILE_NOT_FOUND)`.

## Rate Limit Tracking

```typescript
// Initialized once in constructor, reference never reassigned — only fields mutated in-place.
rateLimit: RateLimitInfo = {
  remaining: Infinity,  // initial state, updated after first API call
  resetAt: new Date(0),
  limit: Infinity,  // "not yet determined" — updated after first API call
};
```

After every GitHub API response, read:
- `x-ratelimit-remaining` -> `remaining`
- `x-ratelimit-reset` (epoch seconds) -> `resetAt`
- `x-ratelimit-limit` -> `limit`

VFSContext checks `rateLimit.remaining` before calling source provider methods. If below threshold (default 100), throws `VFSError(RATE_LIMITED)` with actionable message:

```
"GitHub API rate limit low (23 remaining, resets in 8 minutes). Narrow your search scope or use cached files."
```

### Rate limit budget

- Per installation: base 5,000 requests/hour.
- Scales with org size: +50 req/hour per user (if >20 users), +50 req/hour per repo (if >20 repos).
- Maximum cap: 12,500 req/hour for standard installations. GitHub Enterprise Cloud organizations have a fixed limit of 15,000 req/hour regardless of scaling.
- Different org installations have independent budgets.
- The threshold of 100 remaining is configurable via `VFSContextConfig.rateLimitThreshold`.

## Error Handling

GitHub API errors are mapped to `VFSError`:

| GitHub status | VFSError code | Message |
|---|---|---|
| 401 | PERMISSION_DENIED | "GitHub access has been revoked. Please reconnect your repository." |
| 403 + `x-ratelimit-remaining: 0` or `retry-after` header | RATE_LIMITED | "GitHub API rate limit exceeded. Resets in N minutes." |
| 403 (other — no rate limit headers) | PERMISSION_DENIED | "GitHub App may be missing required permissions for this operation." |
| 403 (blob >100MB) | TOO_LARGE | "File exceeds GitHub's 100 MB blob API limit." |
| 404 | FILE_NOT_FOUND | "File not found in repository at commit {sha}." |
| 422 | INVALID_PARAMETER | "Invalid or missing commit SHA: {sha}. Ensure the commit exists." |
| 429 | RATE_LIMITED | "GitHub API rate limit exceeded (secondary). Retry after N seconds." |
| 5xx | PROVIDER_ERROR | "GitHub API error: {status} {message}" |

## HTTP Client

Use the Deno-native `fetch` API (available in Edge Functions). No external HTTP library needed. Set appropriate headers:

```
Authorization: Bearer {token}
Accept: application/vnd.github+json  (for tree/metadata calls)
Accept: application/vnd.github.raw+json  (for blob content calls)
X-GitHub-Api-Version: 2022-11-28  (or latest stable at implementation time)
```

### Timeout and retry

- Connection timeout: 10 seconds.
- Read timeout: 30 seconds (large trees can take time).
- Retry: one retry on 5xx or network error, with 1-second delay. No retry on 4xx (client errors are deterministic).
- If both attempts fail, throw a `VFSError` with the HTTP status and message.

### Runtime environment note

The code lives in `packages/api/src/vfs/providers/` and runs inside the Supabase Edge Function (Deno). `fetch` is globally available in both Deno and Node.js 18+ (used for unit tests with Jest).
