# Spec 1: VFS Core

The virtual file system core is a three-layer caching proxy that gives LLM agents structured file I/O without a real filesystem. It runs inside Supabase Edge Functions alongside the agent executor.

## Layers

1. **In-memory layer** — `Map<string, { content: string, updatedAt: number }>` per invocation. Hot path for reads/writes.
2. **Persistence layer** — Supabase Storage, shared across sub-agents and invocations of the same session.
3. **Source layer** — A pluggable `SourceProvider` interface (e.g., GitHub API). Files fetched on cache miss.

## File Layout

```
packages/api/src/vfs/
  types.ts              — All VFS types, interfaces, error codes
  sourceProvider.ts     — SourceProvider interface + RateLimitInfo type
  memoryLayer.ts        — In-memory Map cache with timestamps
  storageLayer.ts       — Supabase Storage read/write/delete at session prefix
  dirtySet.ts           — Upstash Redis hash ops for cache coherence
  treeIndex.ts          — Lazy tree fetch, mutation on writes, search/glob
  sessionTracker.ts     — Throttled last_accessed_at updates in Postgres
  pathValidator.ts      — Path validation + protected path enforcement
  vfsContext.ts         — Coordinator: orchestrates read/write through layers
  index.ts              — Public exports
  tools/
    readFile.ts
    listDirectory.ts
    findFiles.ts
    searchText.ts
    getFileMetadata.ts
    getFileTree.ts
    countLines.ts
    searchSymbol.ts
    createFile.ts
    editFile.ts
    deleteFile.ts
    renameFile.ts
    symbolPatterns.ts   — Regex heuristics per language for searchSymbol
    index.ts            — Tool group registration
```

`SourceProvider` is imported only by `vfsContext.ts`. No other layer depends on the source.

## SourceProvider Interface

```typescript
interface SourceProvider {
  readonly commitSha: string;
  readonly rateLimit: RateLimitInfo;
  fetchTree(): Promise<TreeEntry[]>;
  fetchFileContent(path: string): Promise<Uint8Array>;
}

interface TreeEntry {
  path: string;           // repo-relative, e.g. "src/auth/login.ts"
  type: 'file' | 'directory';
  sizeBytes?: number;     // files only
  sha?: string;           // blob SHA for files, tree SHA for directories
}

interface RateLimitInfo {
  remaining: number;
  resetAt: Date;
  limit: number;
}
```

- `commitSha` is readonly — set at construction, immutable for the session.
- `rateLimit` is updated in-place after every API call by the implementation.
- `fetchTree()` returns a flat list. `TreeIndex` builds the nested structure.
- `fetchFileContent(path)` returns `Uint8Array`. The implementation maintains an internal path-to-SHA map (built during `fetchTree()`) to resolve paths to blob SHAs for the Git Blobs API. The interface uses `path` (not SHA) to stay provider-agnostic. Binary detection happens in the VFS layer, not the provider.
- No `fetchFileMetadata` — metadata is derived from tree index (size) + extension-to-language utility + cached content (line count).
- No search method — search is handled by VFSContext via tree-guided selective fetch.

## MemoryLayer

```typescript
interface CachedFile {
  content: string;       // decoded text (binary files never enter cache)
  updatedAt: number;     // epoch ms
}

class MemoryLayer {
  private files: Map<string, CachedFile>;

  get(path: string): CachedFile | undefined;
  set(path: string, content: string, updatedAt: number): void;
  delete(path: string): boolean;
  rename(oldPath: string, newPath: string): boolean;
  has(path: string): boolean;
  paths(): string[];
  entries(): IterableIterator<[string, CachedFile]>;
}
```

Thin `Map` wrapper. No I/O, no async, no dependencies.

## StorageLayer

```typescript
class StorageLayer {
  constructor(supabase: SupabaseClient, sessionPrefix: string);

  upload(path: string, content: string): Promise<void>;
  download(path: string): Promise<string | null>;
  delete(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;  // copy-then-delete, not atomic
  uploadTreeIndex(data: string): Promise<void>;
  downloadTreeIndex(): Promise<string | null>;
  deleteAll(): Promise<void>;
}
```

- Session prefix: `vfs/{tenantSlug}/{agentSlug}/{userId}/{sessionId}`.
- `rename` is copy-then-delete. If delete fails after copy, a duplicate exists. Acceptable for v1 — documented, not worth solving now.
- Supabase client uses anon key + user JWT for RLS-scoped access.
- `deleteAll()` is for the cleanup Edge Function only.

## DirtySetClient

```typescript
class DirtySetClient {
  constructor(redis: Redis, sessionKey: string);

  private readonly redisKey: string;  // "vfs:dirty:{sessionKey}"
  private static readonly TTL_SECONDS = 900;

  getTimestamp(path: string): Promise<number | null>;
  getTimestamps(paths: string[]): Promise<Map<string, number>>;  // HMGET batch
  markDirty(path: string, timestamp: number): Promise<void>;     // HSET + EXPIRE
  markTreeDirty(timestamp: number): Promise<void>;               // markDirty("__tree_index", ts)
  getTreeTimestamp(): Promise<number | null>;
}
```

- Every `markDirty` also runs `EXPIRE` to reset the 15-minute TTL. Pipelined in one round-trip.
- If Redis is unreachable: `getTimestamp` returns current timestamp (forces re-fetch from Storage), `markDirty` silently no-ops. Redis is an optimization, not a requirement.

## TreeIndex

```typescript
interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  sizeBytes?: number;
  language?: string;     // inferred from extension at load time
  children?: TreeNode[];
}

class TreeIndex {
  private tree: TreeNode | null;
  private flatEntries: Map<string, TreeEntry>;
  private updatedAt: number | null;

  isLoaded(): boolean;
  load(entries: TreeEntry[], updatedAt: number): void;
  getTree(path?: string, maxDepth?: number): TreeNode | null;
  listDirectory(path: string, recursive?: boolean, maxDepth?: number): TreeEntry[];
  findFiles(pattern: string, path?: string, exclude?: string[]): string[];
  getMetadata(path: string): { sizeBytes?: number; language?: string } | null;
  exists(path: string): boolean;
  isDirectory(path: string): boolean;

  // Mutations
  addFile(path: string, sizeBytes: number): void;
  removeFile(path: string): void;
  moveFile(oldPath: string, newPath: string): void;
  updateFileSize(path: string, sizeBytes: number): void;

  serialize(): string;
  static deserialize(data: string, updatedAt: number): TreeIndex;
  getUpdatedAt(): number | null;
}
```

- Receives data from VFSContext — never fetches anything itself.
- Two internal representations: nested `TreeNode` tree (for `get_file_tree`) and flat `Map<string, TreeEntry>` (for lookups, globs).
- `language` inferred from extension at load time (`.ts` -> `"typescript"`, `.py` -> `"python"`, etc.).
- Mutations keep both representations in sync. After mutation, VFSContext persists via Storage and marks dirty via Redis.
- Default ignores applied at `load()`: `.git`, `node_modules`, `__pycache__`, `.next`, `dist`, `build`.
- `findFiles` uses glob matching via picomatch against flat entries.
- Serialization: JSON of the flat entries list. Nested tree rebuilt on deserialize.

## SessionTracker

```typescript
class SessionTracker {
  constructor(supabase: SupabaseClient, sessionKey: string);

  private lastTouchTime: number;
  private static readonly THROTTLE_MS = 60_000;

  touch(): Promise<void>;
  initialize(params: {
    tenantSlug: string;
    agentSlug: string;
    userId: string;
    sessionId: string;
    commitSha: string;
  }): Promise<void>;
}
```

### vfs_sessions table

```sql
CREATE TABLE vfs_sessions (
  session_key      TEXT PRIMARY KEY,
  tenant_slug      TEXT NOT NULL,
  agent_slug       TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  session_id       TEXT NOT NULL,
  commit_sha       TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vfs_sessions_last_accessed ON vfs_sessions (last_accessed_at);
```

- `initialize()` runs once at VFSContext creation. Uses `INSERT ... ON CONFLICT DO UPDATE SET last_accessed_at = now()`. Idempotent.
- `touch()` called on every tool call, throttled to one DB write per 60 seconds.

### RLS

```sql
ALTER TABLE vfs_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vfs_sessions_user" ON vfs_sessions
FOR ALL
USING (user_id = auth.uid()::text)
WITH CHECK (user_id = auth.uid()::text);
```

## PathValidator

```typescript
const HARDCODED_BLOCKED: string[] = ['.git/**'];

const DEFAULT_BLOCKED: string[] = [
  'node_modules/**',
  '.env',
  '.env.*',
];

function validatePath(path: string, config?: PathValidationConfig): void;
function validateWritePath(path: string, config?: PathValidationConfig): void;
```

- `validatePath` (all operations): reject empty, leading `/`, `..`, null bytes, match against `HARDCODED_BLOCKED` (`.git/**`). Normalize: strip `./`, collapse `//`, strip trailing `/`.
- `validateWritePath` (writes only): runs `validatePath` + checks configurable blocked patterns (defaults to `DEFAULT_BLOCKED`).
- Two-tier: `.git/**` always blocked on all operations (no override). `node_modules`, `.env` configurable per-agent for writes only.

## VFSContext — Coordinator

```typescript
interface VFSContextConfig {
  tenantSlug: string;
  agentSlug: string;
  userId: string;
  sessionId: string;
  commitSha: string;
  sourceProvider: SourceProvider;
  supabase: SupabaseClient;
  redis: Redis;
  protectedPaths?: string[];
  searchCandidateLimit?: number;   // default 200
  searchConcurrency?: number;      // default 10
  readLineCeiling?: number;        // default 10000
  rateLimitThreshold?: number;     // default 100
}

class VFSContext {
  private memoryLayer: MemoryLayer;
  private storageLayer: StorageLayer;
  private dirtySet: DirtySetClient;
  private treeIndex: TreeIndex;
  private sessionTracker: SessionTracker;
  private sourceProvider: SourceProvider;
  private config: VFSContextConfig;

  constructor(config: VFSContextConfig);
  initialize(): Promise<void>;

  // Read operations
  readFile(path, startLine?, endLine?): Promise<ReadFileResult>;
  listDirectory(path, recursive?, maxDepth?): Promise<ListDirectoryResult>;
  findFiles(pattern, path?, exclude?, maxResults?): Promise<FindFilesResult>;
  searchText(params: SearchTextParams): Promise<SearchTextResult>;
  getFileMetadata(path): Promise<FileMetadataResult>;
  getFileTree(path?, maxDepth?): Promise<FileTreeResult>;
  countLines(path, pattern?, isRegex?): Promise<CountLinesResult>;
  searchSymbol(name, kind?, path?): Promise<SearchSymbolResult>;

  // Write operations
  createFile(path, content): Promise<CreateFileResult>;
  editFile(path, edits?, fullContent?): Promise<EditFileResult>;
  deleteFile(path): Promise<DeleteFileResult>;
  renameFile(oldPath, newPath): Promise<RenameFileResult>;
}
```

### Read path (e.g., readFile)

1. `validatePath(path)` — reject invalid/hardcoded-blocked paths.
2. `sessionTracker.touch()` — throttled heartbeat.
3. Check `memoryLayer.get(path)`:
   - If hit: `dirtySet.getTimestamp(path)`. If null or local `updatedAt >= dirtyTimestamp`, return from memory. If stale, fall through.
4. `storageLayer.download(path)` — if found, populate memory layer, return.
5. Check `sourceProvider.rateLimit.remaining` against threshold. If low, throw `VFSError(RATE_LIMITED)`.
6. Ensure tree is fresh (see below).
7. Check `treeIndex.exists(path)`. If not, throw `VFSError(FILE_NOT_FOUND)`.
8. `sourceProvider.fetchFileContent(path)` — returns `Uint8Array`.
9. Binary detection: check for null bytes. If binary, throw `VFSError(BINARY_FILE)`.
10. Decode to string, populate memory layer and storage layer, return.

**Hard ceiling:** If the requested range (or full file) exceeds `readLineCeiling` (default 10,000 lines), return `VFSError(TOO_LARGE)` with `totalLines` and `tokenEstimate` in the error details. No truncation — the agent gets an error and retries with a range.

### Write path (e.g., createFile)

1. `validateWritePath(path)` — reject invalid/blocked paths.
2. `sessionTracker.touch()`.
3. Ensure tree is fresh.
4. Check `treeIndex.exists(path)`. If exists, throw `VFSError(ALREADY_EXISTS)`.
5. `memoryLayer.set(path, content, timestamp)`.
6. `storageLayer.upload(path, content)`.
7. `dirtySet.markDirty(path, timestamp)`.
8. `treeIndex.addFile(path, byteLength)`.
9. `storageLayer.uploadTreeIndex(treeIndex.serialize())`.
10. `dirtySet.markTreeDirty(timestamp)`.
11. Return result.

### Ensure tree is fresh

Same coherence pattern as files — no special-casing:

1. If not loaded: check `storageLayer.downloadTreeIndex()`. If found, deserialize. If not, check rate limit, call `sourceProvider.fetchTree()`, build tree, persist to Storage, mark dirty.
2. If loaded: check `dirtySet.getTreeTimestamp()`. If null or `treeIndex.getUpdatedAt() >= dirtyTimestamp`, local tree is current. If stale, re-fetch from Storage and reload.

### searchText — tree-guided selective fetch

1. Ensure tree fresh.
2. Filter tree entries by `path` scope and `include_glob`.
3. If candidate count exceeds `searchCandidateLimit` (default 200), throw `VFSError(TOO_LARGE)`.
4. Batch-check dirty set via `dirtySet.getTimestamps(paths)` for candidates in memory.
5. For each candidate: resolve through read path (memory -> storage -> source). Use concurrency pool of 10.
6. Search content (literal or regex). Collect matches, stop at `max_results`.
7. Return results with `truncated: true` if more matches exist.

### editFile — mutual exclusivity

If both `edits` and `fullContent` are provided: `VFSError(INVALID_PARAMETER, "Provide either edits or full_content, not both")`.
If neither: `VFSError(INVALID_PARAMETER, "Provide either edits or full_content")`.

## Error Handling

```typescript
enum VFSErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  INVALID_PATH = 'INVALID_PATH',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  BINARY_FILE = 'BINARY_FILE',
  AMBIGUOUS_MATCH = 'AMBIGUOUS_MATCH',
  MATCH_NOT_FOUND = 'MATCH_NOT_FOUND',
  TOO_LARGE = 'TOO_LARGE',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  RATE_LIMITED = 'RATE_LIMITED',
}

class VFSError extends Error {
  readonly code: VFSErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: VFSErrorCode, message: string, details?: Record<string, unknown>);
}
```

- `VFSError` is the only error type thrown by VFSContext and its layers.
- Infrastructure errors (Supabase down, network issues) are caught and wrapped in `VFSError`.
- Redis errors are swallowed — Redis is an optimization. `getTimestamp` returns current timestamp (forces re-fetch), `markDirty` silently no-ops.
- `details` carries extra data for tool responses (e.g., `{ totalLines, tokenEstimate }` for `TOO_LARGE`).
- Tools (Spec 2) catch `VFSError` and format the `{ success, error, error_code }` JSON response.

## Supabase Storage Bucket & RLS

### Bucket

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('vfs', 'vfs', false);
```

### Storage RLS policies

```sql
CREATE POLICY "vfs_select" ON storage.objects FOR SELECT
USING (
  bucket_id = 'vfs'
  AND (storage.foldername(name))[3] = auth.uid()::text
);

CREATE POLICY "vfs_insert" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'vfs'
  AND (storage.foldername(name))[3] = auth.uid()::text
);

CREATE POLICY "vfs_update" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'vfs'
  AND (storage.foldername(name))[3] = auth.uid()::text
);

CREATE POLICY "vfs_delete" ON storage.objects FOR DELETE
USING (
  bucket_id = 'vfs'
  AND (storage.foldername(name))[3] = auth.uid()::text
);
```

The `name` column excludes the bucket. For `acme/pr-reviewer/user_123/sess_456/src/auth/login.ts`, `storage.foldername(name)` returns `['acme', 'pr-reviewer', 'user_123', ...]`. Postgres arrays are 1-indexed, so `[1]` = tenantSlug, `[2]` = agentSlug, `[3]` = userId.

## Cleanup System

### pg_cron job (every 15 minutes)

```sql
SELECT cron.schedule(
  'cleanup-stale-vfs-sessions',
  '*/15 * * * *',
  $$
    DO $inner$
    DECLARE
      stale_count INTEGER;
    BEGIN
      SELECT count(*) INTO stale_count
      FROM vfs_sessions
      WHERE last_accessed_at < now() - interval '15 minutes';

      IF stale_count > 0 THEN
        PERFORM net.http_post(
          url := current_setting('app.edge_function_url') || '/vfs-cleanup',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-master-key', current_setting('app.edge_function_master_key')
          ),
          body := '{}'::jsonb
        );
      END IF;
    END $inner$;
  $$
);
```

The cron runs every 15 minutes inside Postgres (free). Only invokes the Edge Function when stale rows exist.

### vfs-cleanup Edge Function

1. Query stale sessions: `SELECT session_key FROM vfs_sessions WHERE last_accessed_at < now() - interval '15 minutes'`.
2. For each stale session (sequentially):
   a. Delete Storage objects under `vfs/{session_key}/` (Storage first).
   b. Delete Redis dirty set key `vfs:dirty:{session_key}` (Redis second).
   c. Delete the `vfs_sessions` row (DB row last).
3. Deletion order is critical: Storage -> Redis -> DB row. The row is the anchor — if the function crashes mid-way, the row survives and the next cycle retries.
4. Uses service role key (bypasses RLS) — this is an admin operation.
5. Authenticated via `x-master-key`.

### Cron history pruning

```sql
SELECT cron.schedule(
  'cleanup-cron-history',
  '0 * * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '24 hours'$$
);
```

## Shared Dependencies

`@upstash/redis` and `picomatch` (for glob matching in TreeIndex) are declared in a shared `supabase/functions/deno.json` so both `execute-agent` and `vfs-cleanup` can use them. `picomatch` is also added to `packages/api/package.json` for unit testing:

```
supabase/functions/
  deno.json                    — shared: @upstash/redis, @supabase/supabase-js
  execute-agent/
    deno.json                  — function-specific deps
  vfs-cleanup/
    deno.json                  — function-specific deps (if needed)
```

## Known Limitations (v1)

- **Last-write-wins concurrency.** Two sub-agents writing the same file concurrently is a last-write-wins scenario. Acceptable for v1.
- **StorageLayer rename is not atomic.** Copy-then-delete — if delete fails after copy, a duplicate exists.
- **Redis is eventually consistent.** Short window where a sub-agent could read stale data between another sub-agent's write and the dirty set update.
