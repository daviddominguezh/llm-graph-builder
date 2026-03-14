# Git Context Provider — Architectural Reference

## 1. Purpose of This Document

This document describes the architecture for a subsystem we are calling the **Git Context Provider (GCP)**. It is intended as the single source of truth for engineers implementing this system. It covers the problem, the constraints, the proposed solution, the tool surface, security considerations, and phased delivery.

Read it end to end before writing any code.

---

## 2. Context

We are building a platform where users design AI agent workflows through a visual graph editor. Those workflows are exported as JSON state machines and executed by our runtime library. We offer two execution modes:

- **Self-hosted**: the user runs the runtime on their own infrastructure.
- **Managed (paid)**: we run the runtime on the user's behalf, in serverless functions (Node.js).

User-defined tools (arbitrary code the agent can call) are not executed on our servers. Instead, users expose their tools via MCP servers, and our runtime connects to them as a client. This keeps our infrastructure lean and gives users access to the entire MCP ecosystem.

However, there is a class of capabilities that we **do** want to provide as built-in, platform-native tools — specifically, the ability for agents to interact with Git repositories. The canonical use case is:

> An agent is triggered on a PR event. It reads the diff, browses the relevant parts of the codebase, makes changes (e.g., updates documentation), commits, and pushes — all autonomously.

This document describes how to provide that capability without requiring heavy, per-agent infrastructure.

---

## 3. Problem Statement

Our agents run in **stateless, serverless Node.js functions**. They do not have:

- A persistent or even ephemeral filesystem (beyond `/tmp`, which is small and not guaranteed across invocations).
- A shell or OS-level tooling (`git`, `bash`, etc.).
- Dedicated VMs or containers.

Yet we need to give them the ability to:

1. Browse a repository's file tree.
2. Read file contents at arbitrary refs (branches, commits, tags).
3. Retrieve PR metadata: changed files, diffs, comments, review status.
4. Write files and create atomic, multi-file commits.
5. Push branches, create PRs, and leave review comments.

We need to do this in a way that is:

- **Stateless**: no lingering resources between invocations.
- **Memory-bounded**: fits within serverless memory limits (typically 1–2 GB).
- **Fast**: latency-sensitive; agents are often in a conversational loop.
- **Multi-tenant safe**: one agent's operation must never leak into another's.
- **Provider-agnostic**: must support GitHub initially, with a clear path to GitLab and Bitbucket.

---

## 4. Proposed Solution — Hybrid Architecture

We combine two strategies behind a unified tool interface:

| Strategy | When to use | Characteristics |
|---|---|---|
| **Git Provider REST/GraphQL API** | Reading files, browsing trees, fetching diffs, pushing single-file changes, PR operations | Zero state, no memory overhead, rate-limited by provider |
| **`isomorphic-git` + `memfs`** | Multi-file atomic commits, operations requiring a working tree (staging, diffing locally, rebasing) | In-memory filesystem, bounded by function memory, no external dependencies |

The key insight is: **the agent does not know or care which strategy is used**. The tool interface is identical. The implementation behind each tool decides at call time whether to use the API path or the in-memory-git path, based on the operation and the arguments.

### 4.1 Architecture Diagram (Conceptual)

```
┌─────────────────────────────────────────────────────────┐
│                   Agent Runtime (Serverless)             │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Workflow Execution Engine             │  │
│  │                                                   │  │
│  │   Agent calls: read_file, write_file, get_diff…   │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │                               │
│  ┌──────────────────────▼────────────────────────────┐  │
│  │           Git Context Provider (GCP)              │  │
│  │                                                   │  │
│  │  ┌─────────────┐        ┌──────────────────────┐  │  │
│  │  │  API Bridge  │        │  In-Memory Git       │  │  │
│  │  │             │        │  (isomorphic-git +   │  │  │
│  │  │  Stateless   │        │   memfs)             │  │  │
│  │  │  HTTP calls  │        │                      │  │  │
│  │  └──────┬──────┘        └──────────┬───────────┘  │  │
│  │         │                          │              │  │
│  └─────────┼──────────────────────────┼──────────────┘  │
│            │                          │                  │
└────────────┼──────────────────────────┼──────────────────┘
             │                          │
             ▼                          ▼
   ┌──────────────────┐      ┌──────────────────┐
   │  GitHub / GitLab  │      │  GitHub / GitLab  │
   │  REST / GraphQL   │      │  HTTPS Git Proto  │
   │  API              │      │  (clone/push)     │
   └──────────────────┘      └──────────────────┘
```

### 4.2 Routing Logic

The GCP does not expose the two backends as separate options. Instead, each tool method internally decides its execution path. The general rule:

- **Read-only operations** → always use the API bridge. It's faster, stateless, and doesn't consume memory.
- **Single-file writes** → use the API bridge (the Contents API supports create/update with a commit in one call).
- **Multi-file atomic writes** → use the in-memory git backend. The API bridge cannot atomically commit multiple files through the high-level Contents API. The low-level Git Data API (create blobs → create tree → create commit → update ref) *can*, but it is fragile, verbose, and hard to get right with edge cases (submodules, symlinks, large files). `isomorphic-git` handles this correctly.
- **Operations requiring diff computation or staging** → use the in-memory git backend.

This routing should be an internal implementation detail, invisible to the agent and to the workflow author.

---

## 5. Tool Surface

These are the tools the agent will have access to. They are the **contract**. Internal implementation may change; this interface must remain stable.

### 5.1 Repository Browsing

#### `list_files`
- **Input**: `owner`, `repo`, `path` (optional, defaults to root), `ref` (optional, defaults to default branch)
- **Output**: Array of entries, each with `name`, `type` (`file` | `dir`), `path`, `size` (for files)
- **Behavior**: Returns the contents of a directory. Non-recursive by default. If the agent needs the full tree, it can pass `recursive: true`, which returns a flat list of all file paths in the repo (or subtree).
- **Backend**: API bridge (Trees endpoint).
- **Notes**: For large repos, `recursive: true` on root can return tens of thousands of entries. We should support a `path_prefix` filter server-side to avoid sending massive payloads to the agent. Consider also a `max_depth` parameter.

#### `read_file`
- **Input**: `owner`, `repo`, `path`, `ref` (optional)
- **Output**: File content as UTF-8 string, plus metadata (`size`, `sha`, `encoding`).
- **Behavior**: Returns the content of a single file. For binary files, returns base64-encoded content with `encoding: "base64"`.
- **Backend**: API bridge (Contents endpoint).
- **Notes**: GitHub's Contents API has a **1 MB limit** per file. For files larger than 1 MB, we must fall back to the Blobs API (which supports up to 100 MB). The tool must handle this transparently. If a file exceeds even that, return an error with the file size and let the agent decide what to do.

#### `read_files`  (batch variant)
- **Input**: `owner`, `repo`, `paths[]`, `ref` (optional)
- **Output**: Array of file contents (same shape as `read_file`), preserving order.
- **Behavior**: Reads multiple files in a single tool call. This exists for efficiency — an agent updating docs might need to read 5-10 files, and we should not force 5-10 sequential tool calls.
- **Backend**: API bridge, parallelized. Fire all requests concurrently (with concurrency limits to respect rate limits).
- **Notes**: If any individual file fails (not found, too large), return the error inline for that file without failing the entire batch.

#### `search_files`
- **Input**: `owner`, `repo`, `query`, `path_prefix` (optional), `ref` (optional)
- **Output**: Array of matches, each with `path`, `line_number`, `line_content`, `surrounding_context` (a few lines above and below).
- **Behavior**: Searches file contents within the repo.
- **Backend**: API bridge (GitHub Code Search API for GitHub; equivalent for other providers). Note that GitHub's code search API has specific limitations — it only indexes the default branch and files under 384 KB. For ref-specific search, we may need to fall back to cloning + in-memory grep, or clearly document the limitation.
- **Notes**: This is a best-effort tool. Make its limitations explicit in the tool description so the LLM understands when results may be incomplete.

### 5.2 Pull Request Operations

#### `get_pr`
- **Input**: `owner`, `repo`, `pr_number`
- **Output**: PR metadata — title, description, state, author, base/head branches, merge status, labels, reviewers, created/updated timestamps.
- **Backend**: API bridge.

#### `get_pr_diff`
- **Input**: `owner`, `repo`, `pr_number`
- **Output**: Array of changed files, each with: `path`, `status` (`added` | `modified` | `deleted` | `renamed`), `additions`, `deletions`, `patch` (unified diff string), `previous_path` (if renamed).
- **Backend**: API bridge (Pulls files endpoint).
- **Notes**: GitHub paginates this at 300 files and 3,000 changed files max. For PRs exceeding this (rare but possible in monorepos), document the limitation and consider falling back to the Compare API.

#### `get_pr_comments`
- **Input**: `owner`, `repo`, `pr_number`, `type` (optional: `review` | `issue` | `all`)
- **Output**: Array of comments with author, body, timestamp, and (for review comments) the file path and line range they refer to.
- **Backend**: API bridge.

#### `create_pr`
- **Input**: `owner`, `repo`, `title`, `body`, `head_branch`, `base_branch`, `draft` (optional, defaults to `false`)
- **Output**: PR number, URL.
- **Backend**: API bridge.

#### `add_pr_review`
- **Input**: `owner`, `repo`, `pr_number`, `body`, `event` (`APPROVE` | `REQUEST_CHANGES` | `COMMENT`), `comments[]` (optional, each with `path`, `line`, `body`).
- **Output**: Review ID.
- **Backend**: API bridge.

### 5.3 Write Operations

#### `write_files`
- **Input**: `owner`, `repo`, `branch`, `message` (commit message), `files[]` (each with `path`, `content`, `action`: `create` | `update` | `delete`).
- **Output**: Commit SHA, URL.
- **Behavior**: Atomically commits all specified file changes as a single commit on the given branch.
- **Backend routing**:
  - If `files.length === 1` and action is `create` or `update` → API bridge (Contents API). Simpler, faster.
  - If `files.length > 1` or any action is `delete` → in-memory git backend. Clone the branch (shallow, depth 1), apply changes in memfs, commit, push.
- **Notes**: This is the most complex tool and the one most likely to fail. See section 7 for error handling considerations.

#### `create_branch`
- **Input**: `owner`, `repo`, `branch_name`, `from_ref` (optional, defaults to default branch)
- **Output**: Branch name, ref SHA.
- **Backend**: API bridge (Git Refs API — create a ref pointing at the resolved SHA of `from_ref`).

---

## 6. Provider Abstraction

All tools above are described in terms of `owner` and `repo`, which map naturally to GitHub. However, we must support other providers in the future.

### 6.1 Interface

Define a `GitProvider` interface that every provider adapter must implement. Each method on the interface corresponds roughly to one tool, but at a lower level (e.g., the tool `write_files` may call multiple provider methods).

```
interface GitProvider {
  listTree(repo, path, ref, options): TreeEntry[]
  getFileContent(repo, path, ref): FileContent
  getBlob(repo, sha): BlobContent
  getPullRequest(repo, prNumber): PullRequest
  getPullRequestFiles(repo, prNumber): PullRequestFile[]
  getPullRequestComments(repo, prNumber, type): Comment[]
  createOrUpdateFile(repo, path, content, message, branch, sha?): Commit
  createBlob(repo, content, encoding): BlobRef
  createTree(repo, baseTree, entries): TreeRef
  createCommit(repo, message, tree, parents): CommitRef
  updateRef(repo, ref, sha): void
  createRef(repo, ref, sha): void
  createPullRequest(repo, title, body, head, base, draft): PullRequest
  createReview(repo, prNumber, body, event, comments): Review
  searchCode(repo, query, options): SearchResult[]
}
```

### 6.2 Implementation Priority

1. **GitHub** (via REST API v3 + GraphQL v4 where beneficial). Ship first.
2. **GitLab** (via REST API v4). Second priority.
3. **Bitbucket** (via REST API 2.0). Third.

Each adapter lives in its own module. The GCP resolves which adapter to use based on a `provider` field in the connection configuration (set by the user when linking their repository in the UI).

### 6.3 Authentication

Users connect their Git provider through our UI. This produces an **access token** (OAuth app token or personal access token) that we store encrypted in our secrets store.

At runtime, the GCP receives the token via the workflow execution context — never hardcoded, never in environment variables shared across tenants.

**Important**: the token must be scoped as narrowly as possible. For GitHub, we should request:
- `repo` (for private repos) or `public_repo` (for public only)
- `read:org` (if we need to resolve org membership)
- Nothing else.

Document clearly for users what permissions are required and why.

---

## 7. In-Memory Git Backend — Design Considerations

This section is specifically about the `isomorphic-git` + `memfs` path, since it carries the most risk and complexity.

### 7.1 Lifecycle of an In-Memory Workspace

```
1. ALLOCATE   →  Create a new memfs volume. This is just an object in memory.
2. CLONE      →  Shallow clone (depth: 1, single branch) into the volume.
3. OPERATE    →  Read/write files in the volume. Stage. Commit.
4. PUSH       →  Push the new commit(s) to the remote.
5. RELEASE    →  Dereference the volume. Let GC reclaim it.
```

There is **no pooling, no persistence, no reuse across invocations**. Each time the in-memory backend is needed, we start fresh. This is deliberate — it keeps the model simple and stateless.

### 7.2 Memory Management

A shallow clone loads the entire working tree of the branch tip into memory. This means:

- A repo with 50 MB of source code will consume roughly 50 MB of memory (plus some overhead for git objects and memfs metadata — expect ~1.3–1.5x the working tree size).
- Our serverless functions typically have 1–2 GB of memory. After accounting for the Node.js runtime, the workflow engine, and the agent's context, we have roughly 500 MB–1 GB available for the workspace.
- **This means repos up to ~300-400 MB of working tree are safe.** Beyond that, we risk OOM.

**Mitigations for large repos**:

1. **Sparse clone**: Clone with `noCheckout: true`, then only check out the files the agent actually needs. This requires knowing the paths up front, which we can get from a preceding `list_files` or `get_pr_diff` call. The routing layer should track which files the agent has read and only check out those + the files it wants to write.
2. **Path-scoped clone**: Some Git providers support partial clone with path filters (via `--filter=blob:none` + sparse-checkout). `isomorphic-git` doesn't natively support this, but we can approximate it by cloning tree-only and fetching blobs on demand.
3. **Hard limit**: Set a configurable maximum working tree size (default: 200 MB). If a shallow clone would exceed this, abort and return a clear error to the agent explaining the limitation. Do not silently OOM.
4. **Memory monitoring**: Before and after cloning, check `process.memoryUsage().heapUsed`. If we're above 70% of the function's memory limit, refuse to proceed.

### 7.3 Concurrency

Within a single serverless invocation, only one agent workflow step is executing at a time. However, if `write_files` is called with many files, the internal operations (clone, write, commit, push) are sequential by nature. No concurrency concerns within a single invocation.

Across invocations: since workspaces are fully isolated (separate memfs volumes, separate clones), there is no shared state. Two agents writing to the same branch simultaneously will hit a race condition at push time — one will succeed, the other will get a non-fast-forward error. This is identical to what happens when two developers push to the same branch. We handle it the same way: **retry with rebase** (see section 7.5).

### 7.4 Timeouts

Cloning, even shallow, can be slow for large repos or slow networks. Set aggressive timeouts:

- **Clone**: 30 seconds. If it hasn't completed, abort and return an error.
- **Push**: 15 seconds. Pushes are small (we're pushing one commit with a few changed files).
- **Total operation (clone + operate + push)**: 60 seconds.

These timeouts are configurable per deployment but should have sensible defaults. Remember that serverless functions themselves have an execution time limit (often 30s–300s depending on provider), and the git operation is only one step in a multi-step workflow.

### 7.5 Push Failure and Retry

If a push fails due to a non-fast-forward error (the remote branch moved since we cloned):

1. Fetch the latest commit of the branch (single fetch, depth 1).
2. Attempt a rebase of our commit onto the new tip. `isomorphic-git` does not have native rebase, so we implement it manually: read our changes, reset to the new tip, reapply changes, recommit.
3. If the reapply produces conflicts (our changed files were also changed remotely), **do not attempt auto-resolution**. Abort and return a clear error to the agent, listing the conflicting files. The agent (or the workflow) can decide how to proceed.
4. Maximum 2 retries. After that, fail hard.

### 7.6 Cleanup

After the operation completes (success or failure), the memfs volume must be dereferenced immediately. Do not hold onto it for potential reuse. In a serverless context, the function may be frozen and thawed, and holding a large memory allocation across freeze/thaw is wasteful and may cause OOM on thaw.

```js
// Pseudocode
let vol = new Volume();
try {
  await clone(vol, ...);
  await applyChanges(vol, ...);
  await push(vol, ...);
} finally {
  vol = null; // Dereference. GC will reclaim.
}
```

---

## 8. Caching Strategy

### 8.1 What to Cache

Since our functions are stateless, "caching" means in-memory caches that live only for the duration of a single invocation. This is still valuable because an agent might call `list_files`, then `read_file` several times, then `write_files` — all within one invocation.

- **Tree listings**: Cache the result of `list_files` for a given `(repo, ref)`. If the agent browses multiple directories, we don't re-fetch the tree each time.
- **File contents**: Cache `read_file` results keyed by `(repo, path, ref)`. The agent often reads a file, reasons about it, then reads it again.
- **PR metadata**: Cache `get_pr` and `get_pr_diff` results for the duration of the invocation.

### 8.2 What NOT to Cache

- **Across invocations**: Do not attempt cross-invocation caching (e.g., in Redis or an external store). The added complexity and latency outweigh the benefit for our use case. If this becomes a bottleneck later, revisit.
- **Write results**: After a `write_files` call, invalidate any cached tree listings and file contents for the affected branch.

### 8.3 Implementation

A simple `Map` object scoped to the GCP instance for that invocation. Nothing fancier. Set a max size (e.g., 50 MB total cached content) and evict LRU if exceeded.

---

## 9. Rate Limiting and Quotas

### 9.1 Provider Rate Limits

GitHub's API allows 5,000 requests per hour per authenticated user. GitLab allows 2,000. A single agent run might make 10–50 API calls depending on the workflow. This is generally fine for individual use, but becomes a concern at scale.

**Mitigations**:

- **Batch where possible**: `read_files` (batch) instead of multiple `read_file` calls. Use GraphQL for GitHub where it reduces call count (e.g., fetching multiple file contents in one query).
- **Respect `Retry-After`**: If we hit a rate limit, wait and retry. Do not hammer.
- **Track usage**: Log API call counts per invocation and per user. Surface this in our dashboard so users can see their usage and adjust workflows accordingly.
- **Use conditional requests**: Send `If-None-Match` / `ETag` headers. GitHub doesn't count 304 responses against the rate limit.

### 9.2 Our Own Quotas

On the managed (paid) plan, we should impose our own limits to prevent abuse and control costs:

- **Max API calls per workflow invocation**: 100 (configurable per plan tier).
- **Max in-memory clone size**: 200 MB (configurable).
- **Max file size for write**: 10 MB per file (GitHub's own limit is 100 MB; we set a lower one for sanity).
- **Max files per `write_files` call**: 50.
- **Max invocations per hour per user**: depends on pricing tier.

These limits should be enforced in the GCP layer, not in the individual provider adapters. Return clear, actionable errors when limits are hit.

---

## 10. Error Handling Philosophy

Every tool call that the agent makes can fail. The agent is an LLM — it can reason about errors and retry or adjust its approach, but only if the errors are clear and actionable.

### 10.1 Error Shape

Every error returned to the agent must have:

```json
{
  "error": true,
  "code": "FILE_NOT_FOUND",
  "message": "The file 'docs/api.md' does not exist on branch 'main'.",
  "retryable": false,
  "suggestions": ["Check the file path using list_files.", "Verify the branch name."]
}
```

The `suggestions` field is important. It tells the LLM what to do next. Think of it as a hint for the agent's next action.

### 10.2 Error Codes (non-exhaustive)

| Code | Meaning | Retryable |
|---|---|---|
| `FILE_NOT_FOUND` | Path does not exist at the given ref | No |
| `FILE_TOO_LARGE` | File exceeds size limit | No |
| `REPO_NOT_FOUND` | Repository does not exist or token lacks access | No |
| `BRANCH_NOT_FOUND` | Ref does not exist | No |
| `RATE_LIMITED` | Provider rate limit hit | Yes (after delay) |
| `PUSH_CONFLICT` | Non-fast-forward; branch diverged | Yes (auto-retry with rebase, up to 2x) |
| `PUSH_FAILED` | Push failed for other reasons (permissions, branch protection) | No |
| `CLONE_TIMEOUT` | Shallow clone exceeded timeout | Yes (once) |
| `MEMORY_EXCEEDED` | Repo too large for in-memory workspace | No |
| `QUOTA_EXCEEDED` | Platform quota hit | No |
| `AUTH_FAILED` | Token invalid or expired | No |

### 10.3 Logging

Log every API call and every in-memory git operation with: timestamp, operation, repo, duration, success/failure, error code if applicable. This is essential for debugging user-reported issues and for understanding performance characteristics.

Do **not** log file contents or diffs — these may contain sensitive code.

---

## 11. Security Considerations

### 11.1 Tenant Isolation

This is non-negotiable. Every aspect of the system must guarantee that one tenant cannot access another tenant's data.

- **Tokens**: Each workflow invocation receives only the token for the user who owns that workflow. Tokens are fetched from the secrets store at invocation time and never persisted in memory beyond the invocation.
- **memfs volumes**: Scoped to a single invocation. No shared state.
- **API calls**: Authenticated with the user's token. The provider enforces access control.
- **Logs**: Must include a tenant/user ID but never include tokens or file contents.

### 11.2 Token Handling

- Tokens are stored encrypted at rest in our secrets store.
- Tokens are transmitted to the serverless function via secure, encrypted channels (e.g., environment variable injection by the serverless platform, or fetched from a secrets manager at runtime).
- Tokens are **never** logged, never included in error messages, never returned to the agent.
- If a token is expired or revoked, return `AUTH_FAILED` and surface a user-facing error in the workflow dashboard prompting re-authentication.

### 11.3 Input Validation

The agent (an LLM) is generating the tool call arguments. LLMs can hallucinate or produce unexpected input. Every tool must validate:

- `owner` and `repo`: Must match `^[a-zA-Z0-9._-]+$`. No path traversal.
- `path`: Must be a valid relative path. No `..`, no absolute paths, no null bytes.
- `branch`: Must be a valid git ref name. No spaces, no `..`, no control characters.
- `content`: Must be a valid UTF-8 string (or base64 for binary). Enforce size limits.
- `pr_number`: Must be a positive integer.

Reject invalid input with a clear `INVALID_INPUT` error. Do not attempt to "fix" the input — let the agent correct itself.

### 11.4 Branch Protection Awareness

Some branches (e.g., `main`, `production`) may have protection rules: no direct pushes, required reviews, required CI. Our tooling should not bypass these protections.

If a push fails due to branch protection, return a clear error explaining why. The agent (or workflow) should be designed to work on feature branches and create PRs, not push directly to protected branches.

---

## 12. Packaging and Exposure

### 12.1 As a Built-In MCP Server

The GCP will be packaged as an MCP server that we host. On the managed plan, it is automatically available to all agent workflows — no user configuration needed beyond connecting their Git provider.

On the self-hosted plan, we can offer the GCP MCP server as a Docker image the user can run alongside their workflow runtime, or as an npm package they can embed directly.

### 12.2 Tool Registration

Each tool (section 5) is registered as an MCP tool with a clear `name`, `description`, and `inputSchema`. The descriptions must be written for an LLM audience — concise, unambiguous, with examples of when to use each tool and what to expect.

Example:

```json
{
  "name": "read_file",
  "description": "Read the contents of a single file from a Git repository. Returns the file as a UTF-8 string. For binary files, returns base64-encoded content. Use this when you need to inspect a specific file. For reading multiple files, prefer 'read_files' for efficiency.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "owner": { "type": "string", "description": "Repository owner (user or org)" },
      "repo": { "type": "string", "description": "Repository name" },
      "path": { "type": "string", "description": "File path relative to repo root, e.g. 'src/index.ts'" },
      "ref": { "type": "string", "description": "Branch, tag, or commit SHA. Defaults to the repo's default branch." }
    },
    "required": ["owner", "repo", "path"]
  }
}
```

Pay attention to tool descriptions. They directly affect how well the agent uses the tools. Iterate on them.

---

## 13. Observability

### 13.1 Metrics to Track

- **API calls per invocation**: broken down by tool and by provider endpoint.
- **In-memory clone frequency**: how often we fall back to isomorphic-git.
- **Clone duration**: p50, p95, p99.
- **Push success/failure rate**: and failure reasons.
- **Memory high-water mark**: per invocation, for invocations that use in-memory git.
- **Rate limit hits**: per user, per provider.

### 13.2 Alerting

- Alert on rate limit hit rate exceeding a threshold (indicates a workflow is making too many calls).
- Alert on OOM kills in serverless functions (indicates repos exceeding our size assumptions).
- Alert on push failure rate spikes (may indicate a provider outage or auth issues).

---

## 14. Phased Delivery

### Phase 1 — API Bridge (Read-Only + Single-File Writes)

**Goal**: Get the core read path working end to end.

**Scope**:
- `list_files`, `read_file`, `read_files`
- `get_pr`, `get_pr_diff`, `get_pr_comments`
- `create_branch`, `create_pr`, `add_pr_review`
- Single-file `write_files` (via Contents API)
- GitHub only
- In-memory caching within invocation
- Input validation, error handling, logging

**This phase covers the majority of use cases** — reading diffs, reading files, making single-file updates, creating PRs, leaving reviews. Ship this and get user feedback before building Phase 2.

### Phase 2 — In-Memory Git (Multi-File Atomic Writes)

**Goal**: Support atomic multi-file commits.

**Scope**:
- `isomorphic-git` + `memfs` integration
- Routing logic in `write_files` (single-file → API, multi-file → in-memory)
- Shallow clone with memory budgeting
- Push with retry/rebase on conflict
- Memory monitoring and hard limits
- Timeout enforcement

### Phase 3 — Search and Provider Expansion

**Goal**: Add search and support more providers.

**Scope**:
- `search_files` tool (GitHub Code Search API)
- GitLab provider adapter
- Bitbucket provider adapter
- Refine tool descriptions based on real-world agent usage data

### Phase 4 — Optimizations

**Goal**: Performance and cost improvements based on usage data.

**Scope**:
- GraphQL batching for GitHub (reduce API call count)
- Conditional requests (ETag caching with providers)
- Sparse clone / lazy blob loading for large repos
- Cross-invocation caching (if warranted by usage patterns — likely not, but measure first)

---

## 15. Open Questions

These are decisions we have not finalized. Resolve them before or during implementation.

1. **Should `write_files` support a `create_pr` shorthand?** e.g., write files + create branch + create PR in one tool call. This simplifies the common "make changes and open a PR" flow from 3 tool calls to 1. Downside: conflates concerns, reduces agent flexibility. **Recommendation**: No. Keep tools atomic. The agent can chain them.

2. **How do we handle repos that require SSH authentication?** `isomorphic-git` supports HTTP(S) auth easily but SSH is more complex. Most Git providers support HTTPS with token auth, so this may not be a real issue. **Recommendation**: Support HTTPS only initially. Add SSH if users request it.

3. **Do we support git submodules?** `isomorphic-git` does not handle submodules well. **Recommendation**: No. Explicitly document that submodules are unsupported. If a repo uses submodules, the agent can only interact with the top-level repo.

4. **Should the GCP be aware of file types?** e.g., automatically detecting that a `.json` file should be syntax-checked before commit, or that a `.md` file should not contain binary content. **Recommendation**: No. The GCP is a transport layer. Content validation is the agent's (or the workflow's) responsibility.

5. **What happens when the agent's token is a GitHub App installation token with limited repository access?** The provider APIs will enforce access control (404 for inaccessible repos). We just need to ensure our error handling surfaces this clearly. **Recommendation**: Handle normally. The `REPO_NOT_FOUND` error message should mention that the token may lack access.