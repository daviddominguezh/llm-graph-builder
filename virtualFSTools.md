We will implement a virtual file system where our agents can read and modify files by using the tools defined at the bottom of this document as wrappers for structured operations against an in-memory cache backed by Supabase Storage.

## Architecture

The VFS is NOT a full filesystem or shell sandbox. It is a three-layer caching proxy:

1. **In-memory layer**: A `Map<string, { content: string, updatedAt: number }>` (or lightweight class wrapping one) that lives in the serverless function's process memory. This is the hot path — most tool calls resolve here.
2. **Persistence layer**: Supabase Storage, used as a shared cache so that multiple invocations of the same session (or sub-agents) can access the same VFS context.
3. **Source layer**: The upstream source of truth for the codebase (e.g., a Git provider API like GitHub or GitLab). Files are fetched from here on cache miss.

Do NOT use any VFS sandbox library. The in-memory layer is a `Map<string, { content: string, updatedAt: number }>` (keys are repo-relative file paths) plus a `Map<string, FileMetadata>` for metadata. The `updatedAt` timestamp on each entry is used for cache coherence with the Redis dirty set (see Cache Coherence below). Build a thin `VFSContext` class that encapsulates these maps, an Upstash Redis client, a Supabase client, and the read/write logic described below. No shell execution, no temp directories, no filesystem mounting.

## Read Path

The full read path is described in the Cache Coherence section below, since it involves the dirty set check. In summary:

1. Check the in-memory cache. If found, validate freshness against the Redis dirty set (see Cache Coherence). If fresh, return it.
2. Fetch from Supabase Storage at the session's prefix path. If found, populate the in-memory cache, then return it.
3. Fetch from the source (Git provider API). Save it to Supabase Storage AND the in-memory cache, then return it.

## Write Path

When a tool needs to write a file (create, edit, delete, rename):

1. Apply the mutation to the in-memory cache immediately. Store the current timestamp alongside the content (e.g., `Map<string, { content: string, updatedAt: number }>`).
2. Persist the mutated file to Supabase Storage at the session's prefix path immediately (do not defer this — other invocations may need it).
3. Update the dirty set in Upstash Redis (see Cache Coherence below).

## Cache Coherence Across Sub-Agents

Different invocations (sub-agents, retries, continuations) of the same session share the Supabase Storage layer but have independent in-memory caches. This creates a stale-read risk. We solve this with a dirty set stored in Upstash Redis.

### Dirty set structure in Redis

Use a Redis hash per session. The key is `vfs:dirty:{sessionKey}` (where `sessionKey` is `{tenantSlug}/{agentSlug}/{userId}/{sessionId}`). Each field in the hash is a file path, and the value is the epoch timestamp (milliseconds) of the last write:

```
HSET vfs:dirty:acme/pr-reviewer/user_123/sess_456 "src/auth/login.ts" 1711792800000
HSET vfs:dirty:acme/pr-reviewer/user_123/sess_456 "src/utils/helpers.ts" 1711792805000
```

Every time the hash is written to, reset its TTL to 15 minutes:

```
EXPIRE vfs:dirty:acme/pr-reviewer/user_123/sess_456 900
```

This means the dirty set auto-deletes from Redis when the session goes idle, with no cron needed on the Redis side.

### Read path with cache validation

When a tool needs to read a file:

1. Check the in-memory cache. If found, check whether this file has a dirty entry in Redis:
   - Call `HGET vfs:dirty:{sessionKey} {filePath}`.
   - If the key does not exist in the dirty set, the in-memory version is authoritative — return it.
   - If the dirty set has an `updatedAt` timestamp for this path, compare it to the `updatedAt` stored alongside the in-memory cached content. If the in-memory `updatedAt >= dirty updatedAt`, the local version is already current — return it. If the in-memory `updatedAt < dirty updatedAt`, the local version is stale — proceed to step 2.
2. Fetch from Supabase Storage at the session's prefix path. If found, populate the in-memory cache (with `updatedAt` set to `Date.now()`), then return it.
3. Fetch from the source (Git provider API). Save it to Supabase Storage AND the in-memory cache, then return it.

### Write path dirty set update

When a tool writes a file, after persisting to Supabase Storage:

```
HSET vfs:dirty:{sessionKey} {filePath} {Date.now()}
EXPIRE vfs:dirty:{sessionKey} 900
```

Also update the in-memory cache entry's `updatedAt` to the same timestamp, so that the current invocation won't re-fetch a file it just wrote.

### Performance notes

- Redis HGET is ~1ms from a serverless function. This is negligible compared to the LLM round-trip.
- For tools that read many files in one call (e.g., `search_text` scanning across cached files), use `HMGET` to batch-check multiple paths in a single Redis call rather than issuing one HGET per file.
- If Redis is unreachable, fall back to skipping the in-memory cache and reading directly from Supabase Storage. Do not fail the tool call because of a Redis outage — Redis is an optimization, not a requirement.

This is an eventually-consistent model. Two sub-agents writing to the same file concurrently is a last-write-wins scenario. This is acceptable for v1 — document it as a known limitation.

## Session-Scoped Storage in Supabase

### Storage path convention

The Supabase Storage path prefix for a VFS context is:

```
vfs/{tenantSlug}/{agentSlug}/{userId}/{sessionId}/
```

All files are stored under this prefix using their repo-relative path. Examples:

```
vfs/acme/pr-reviewer/user_123/sess_456/src/auth/login.ts
vfs/acme/pr-reviewer/user_123/sess_456/src/utils/helpers.ts
vfs/acme/pr-reviewer/user_123/sess_456/__tree_index.json
```

The composite key `{tenantSlug}/{agentSlug}/{userId}/{sessionId}` is globally unique. The `sessionId` alone is NOT unique — it is only unique within the scope of a tenant + agent + user.

### Session tracking and TTL cleanup

Supabase Storage does not support automatic TTLs. Implement cleanup as follows:

1. Create a `vfs_sessions` table in Supabase Postgres:

```sql
CREATE TABLE vfs_sessions (
  session_key TEXT PRIMARY KEY,  -- '{tenantSlug}/{agentSlug}/{userId}/{sessionId}'
  tenant_slug TEXT NOT NULL,
  agent_slug TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vfs_sessions_last_accessed ON vfs_sessions (last_accessed_at);
```

2. On every VFS tool call, update `last_accessed_at` for the session. Batch this — don't hit Postgres on every single tool call. Instead, update at most once per minute per invocation (track the last update time in memory and skip if less than 60 seconds have passed).

3. Set up a pg_cron job that runs every 15 minutes:

```sql
SELECT cron.schedule(
  'cleanup-stale-vfs-sessions',
  '*/15 * * * *',
  $$
    WITH stale AS (
      DELETE FROM vfs_sessions
      WHERE last_accessed_at < now() - interval '15 minutes'
      RETURNING session_key
    )
    SELECT session_key FROM stale;
  $$
);
```

4. The cron job identifies stale session keys. A Supabase Edge Function (triggered by the cron or by a database webhook on deletes from `vfs_sessions`) deletes all objects under the corresponding `vfs/{session_key}/` prefix in Supabase Storage.

## Tool Registration

The tools defined at the bottom of this document form a single "tool group" called `vfs`. There are 12 tools total. When the user enables the `vfs` tool group for an agent, ALL 12 tools are provided to the agent upfront in the system prompt. Do NOT use tool search / dynamic discovery for this group — the tools are few enough (~2-3K tokens for all schemas combined) and the agent will need most of them on nearly every session.

Tool search / dynamic discovery is reserved for situations where we have a large catalog of tool groups across many domains. The VFS group is always injected as a whole.

## Where This Code Lives

These tools live in the `api` package (the module that contains the logic for running agents, which in production runs inside a serverless function). The tool group is registered alongside other tool groups and is injected into the agent's tool list when the user enables it.

Each tool is a function that:
1. Receives the tool parameters (as defined in at the bottom of this document).
2. Receives a `VFSContext` instance (which holds the in-memory cache, the Supabase client, the Upstash Redis client, and the session key).
3. Performs the operation through the VFSContext.
4. Returns the response shape defined at the bottom of this document.

The `VFSContext` is instantiated once per invocation with the session key derived from the execution context (`tenantSlug`, `agentSlug`, `userId`, `sessionId`). It is passed to every tool call in that invocation. At the end of the invocation, no explicit cleanup is needed — the in-memory maps are garbage collected, and Supabase Storage is cleaned up by the cron job.

## Implementation Priorities

Implement in this order:

1. `VFSContext` class with the three-layer read/write logic, Upstash Redis dirty set management, and timestamp-based cache validation.
2. Read tools: `read_file`, `list_directory`, `find_files`, `search_text`, `get_file_metadata`.
3. Write tools: `create_file`, `edit_file`, `delete_file`, `rename_file`.
4. Remaining read tools: `get_file_tree`, `count_lines`, `search_symbol`.
5. Session tracking table, `last_accessed_at` updates, and the cleanup cron job (pg_cron every 15 min) + Edge Function for Supabase Storage cleanup.
6. Integration tests that simulate multi-invocation scenarios (sub-agent A writes, sub-agent B reads) to verify cache coherence via the Redis dirty set.

## Tool definitions
# Agent Codebase Tools — Specification v1

## Overview

This document defines the tool set for an LLM agent operating inside a serverless JS function. There is no real filesystem — instead, a virtual representation of one is exposed through structured tools. The agent uses these tools to navigate, read, search, and mutate files in a codebase.

**Scope of v1:** File I/O only (read + write). Git operations and review annotations are planned for v2 and v3 respectively.

**Design principles:**

- Every tool has a JSON-schema input and a well-defined output shape. No free-form command strings.
- Tool names use `snake_case` and are verb-first (`read_file`, not `file_read`).
- All paths are relative to the repository root. Leading slashes and `..` traversal must be rejected.
- Every response includes a `success` boolean and an `error` string when `success` is `false`.
- Tools should fail fast with clear error messages rather than returning ambiguous partial results.

**A note on the virtual filesystem:**
The backing implementation may fetch content from a Git provider API, an in-memory tree, a database, or any other source. The agent does not know or care — it sees a POSIX-like file tree. The implementation must normalize paths (strip leading `/`, resolve `.`) before processing.

---

## Table of Contents

- [Agent Codebase Tools — Specification v1](#agent-codebase-tools--specification-v1)
  - [Overview](#overview)
  - [Table of Contents](#table-of-contents)
  - [Read Tools](#read-tools)
    - [1. read\_file](#1-read_file)
    - [2. list\_directory](#2-list_directory)
    - [3. find\_files](#3-find_files)
    - [4. search\_text](#4-search_text)
    - [5. get\_file\_metadata](#5-get_file_metadata)
    - [6. get\_file\_tree](#6-get_file_tree)
    - [7. count\_lines](#7-count_lines)
    - [8. search\_symbol](#8-search_symbol)
  - [Write Tools](#write-tools)
    - [9. create\_file](#9-create_file)
    - [10. edit\_file](#10-edit_file)
    - [11. delete\_file](#11-delete_file)
    - [12. rename\_file](#12-rename_file)
  - [Error Handling](#error-handling)
  - [Implementation Notes](#implementation-notes)
    - [Caching strategy](#caching-strategy)
    - [Token budget awareness](#token-budget-awareness)
    - [Tool registration](#tool-registration-1)
  - [Future Versions](#future-versions)

---

## Read Tools

### 1. read_file

The single most called tool. The agent uses it to inspect source code, config files, documentation, and anything else it needs to reason about. Expect 50%+ of all tool invocations to be this one, so optimize it.

**Parameters:**

| Name         | Type     | Required | Description                                                                 |
|-------------|----------|----------|-----------------------------------------------------------------------------|
| `path`      | string   | yes      | Relative path to the file from the repo root.                               |
| `start_line`| integer  | no       | 1-based line number to start reading from. Defaults to `1`.                 |
| `end_line`  | integer  | no       | 1-based inclusive line number to stop at. Defaults to end of file.          |

**Response:**

```json
{
  "success": true,
  "path": "src/auth/login.ts",
  "content": "import express from 'express';\n...",
  "start_line": 1,
  "end_line": 45,
  "total_lines": 230
}
```

**Behavior notes:**

- When `start_line` / `end_line` are omitted, return the entire file.
- Always include `total_lines` in the response so the agent knows how much it hasn't seen and can request further ranges.
- If the file exceeds a size threshold (suggested: 500 lines), consider truncating and returning a warning like `"truncated": true` so the agent learns to request ranges instead.
- Binary files should return `"error": "Binary file, cannot display content"` with `success: false`.

**Example — agent reads a specific function:**

```
Agent: I need to check the login handler.
Tool call: read_file({ path: "src/auth/login.ts", start_line: 82, end_line: 115 })
```

---

### 2. list_directory

Gives the agent spatial awareness of the project layout. Typically one of the first tools called in any session.

**Parameters:**

| Name         | Type     | Required | Description                                                              |
|-------------|----------|----------|--------------------------------------------------------------------------|
| `path`      | string   | no       | Directory to list. Defaults to `""` (repo root).                         |
| `recursive` | boolean  | no       | If `true`, list contents of subdirectories too. Defaults to `false`.     |
| `max_depth` | integer  | no       | When `recursive` is true, limit depth. Defaults to `2`.                  |

**Response:**

```json
{
  "success": true,
  "path": "src/auth",
  "entries": [
    { "name": "login.ts",      "type": "file" },
    { "name": "logout.ts",     "type": "file" },
    { "name": "middleware",     "type": "directory" },
    { "name": "README.md",     "type": "file" }
  ]
}
```

**Behavior notes:**

- Each entry must have `name` and `type` (`"file"` or `"directory"`).
- Sort directories first, then files, both alphabetically.
- Respect common ignores: `.git`, `node_modules`, `__pycache__`, `.next`, `dist`, `build`. Consider making the ignore list configurable.
- When `recursive` is true, nest entries under their parent directory or flatten with full relative paths — pick one and be consistent. Recommendation: flatten with relative paths, it's easier for the agent to parse.

**Example — agent explores the repo root:**

```
Agent: Let me understand the project structure.
Tool call: list_directory({ path: "", recursive: true, max_depth: 2 })
```

---

### 3. find_files

Pattern-based file discovery. The agent uses this to locate files by name or extension without knowing the exact path. This is the equivalent of `find` + globbing.

**Parameters:**

| Name         | Type     | Required | Description                                                                |
|-------------|----------|----------|----------------------------------------------------------------------------|
| `pattern`   | string   | yes      | Glob pattern to match. E.g. `"**/*.sql"`, `"**/package.json"`.            |
| `path`      | string   | no       | Directory to search within. Defaults to `""` (repo root).                 |
| `exclude`   | string[] | no       | Glob patterns to exclude. E.g. `["node_modules/**", "dist/**"]`.          |
| `max_results`| integer | no       | Cap on number of matches returned. Defaults to `100`.                     |

**Response:**

```json
{
  "success": true,
  "pattern": "**/*.sql",
  "matches": [
    "db/migrations/001_create_users.sql",
    "db/migrations/002_add_roles.sql",
    "db/seeds/test_data.sql"
  ],
  "total_matches": 3,
  "truncated": false
}
```

**Behavior notes:**

- Use standard glob syntax. At minimum support `*` (single segment), `**` (recursive), and `?` (single char).
- Always apply the default excludes from `list_directory` plus any user-provided `exclude` patterns.
- Return paths relative to the repo root, not to `path`.

**Example — agent looks for Dockerfiles:**

```
Agent: Are there any Dockerfiles in this project?
Tool call: find_files({ pattern: "**/Dockerfile*" })
```

---

### 4. search_text

Full-text search across the codebase. Critical for security review (finding dangerous patterns) and general code comprehension. This is the agent's `grep -r`.

**Parameters:**

| Name           | Type     | Required | Description                                                                  |
|---------------|----------|----------|------------------------------------------------------------------------------|
| `pattern`     | string   | yes      | Search string or regex pattern.                                              |
| `is_regex`    | boolean  | no       | If `true`, treat `pattern` as a regex. Defaults to `false` (literal match).  |
| `path`        | string   | no       | Directory scope. Defaults to `""` (repo root).                               |
| `include_glob`| string   | no       | Only search files matching this glob. E.g. `"*.ts"`.                         |
| `ignore_case` | boolean  | no       | Case-insensitive search. Defaults to `false`.                                |
| `max_results` | integer  | no       | Cap on total matches returned. Defaults to `50`.                             |

**Response:**

```json
{
  "success": true,
  "pattern": "eval(",
  "matches": [
    {
      "path": "src/utils/template.ts",
      "line": 42,
      "column": 12,
      "content": "    const result = eval(userInput);",
      "context_before": ["    // Process the template string", "    try {"],
      "context_after": ["    } catch (e) {", "      logger.error(e);"]
    }
  ],
  "total_matches": 1,
  "truncated": false
}
```

**Behavior notes:**

- Each match should include 2 lines of context above and below (configurable, but 2 is a good default). This saves the agent a follow-up `read_file` call in many cases.
- Binary files should be skipped silently.
- If `total_matches` exceeds `max_results`, set `truncated: true` and include the real count in `total_matches` so the agent knows it's seeing a subset.
- For regex mode, use the flavor your runtime supports natively (JS `RegExp`). Document which flavor it is.

**Example — agent hunts for SQL injection vectors:**

```
Agent: Check for raw SQL string concatenation.
Tool call: search_text({
  pattern: "\\$\\{.*\\}.*(?:SELECT|INSERT|UPDATE|DELETE)",
  is_regex: true,
  include_glob: "*.ts",
  ignore_case: true
})
```

---

### 5. get_file_metadata

Lightweight probe that lets the agent decide *whether* to read a file and how to approach it without pulling the full content. Cheap to call, saves tokens.

**Parameters:**

| Name   | Type   | Required | Description                          |
|--------|--------|----------|--------------------------------------|
| `path` | string | yes      | Relative path to the file.           |

**Response:**

```json
{
  "success": true,
  "path": "src/auth/login.ts",
  "size_bytes": 8432,
  "line_count": 230,
  "language": "typescript",
  "last_modified": "2026-03-28T14:22:00Z",
  "is_binary": false
}
```

**Behavior notes:**

- `language` should be inferred from the file extension. Use a simple mapping (`.ts` → `"typescript"`, `.py` → `"python"`, `.rs` → `"rust"`, etc.). Return `"unknown"` for unrecognized extensions.
- `last_modified` is optional for v1 — include it if your backing store provides it, omit the field if not.
- This tool should be very fast. No need to read file contents to serve it — derive everything from metadata/indexing.

**Example — agent checks if a file is worth reading:**

```
Agent: How big is the main config file?
Tool call: get_file_metadata({ path: "config/production.json" })
→ 12,000 lines — agent decides to search_text instead of read_file.
```

---

### 6. get_file_tree

A richer, structured overview of the project. Unlike `list_directory`, this is designed to give the agent a birds-eye map with size hints so it can prioritize exploration. Think of it as `tree` with extras.

**Parameters:**

| Name         | Type     | Required | Description                                               |
|-------------|----------|----------|-----------------------------------------------------------|
| `path`      | string   | no       | Root of the subtree. Defaults to `""`.                    |
| `max_depth` | integer  | no       | How deep to recurse. Defaults to `3`.                     |

**Response:**

```json
{
  "success": true,
  "path": "",
  "tree": {
    "name": ".",
    "type": "directory",
    "children": [
      {
        "name": "src",
        "type": "directory",
        "children": [
          {
            "name": "auth",
            "type": "directory",
            "children": [
              { "name": "login.ts", "type": "file", "size_bytes": 8432, "language": "typescript" },
              { "name": "logout.ts", "type": "file", "size_bytes": 1203, "language": "typescript" }
            ]
          },
          { "name": "index.ts", "type": "file", "size_bytes": 540, "language": "typescript" }
        ]
      },
      { "name": "package.json", "type": "file", "size_bytes": 1822, "language": "json" },
      { "name": "README.md", "type": "file", "size_bytes": 3400, "language": "markdown" }
    ]
  }
}
```

**Behavior notes:**

- Apply the same default ignores as `list_directory`.
- Include `size_bytes` and `language` on file nodes — these help the agent reason about which files are significant.
- For very large repos, enforce a cap on total nodes returned (suggested: 500) and set `"truncated": true` if hit.
- Difference from `list_directory`: this tool always returns a nested structure, always includes file metadata, and is meant for "give me the big picture" calls. `list_directory` is for "what's in this specific folder."

---

### 7. count_lines

A lightweight tool that lets the agent gauge file size or count pattern occurrences without pulling full content. Avoids wasting context window on large files the agent only needs a count from.

**Parameters:**

| Name      | Type     | Required | Description                                                          |
|-----------|----------|----------|----------------------------------------------------------------------|
| `path`    | string   | yes      | File or directory to count in.                                       |
| `pattern` | string   | no       | If provided, count only lines matching this literal string or regex. |
| `is_regex`| boolean  | no       | Treat `pattern` as regex. Defaults to `false`.                       |

**Response:**

```json
{
  "success": true,
  "path": "src/auth/login.ts",
  "total_lines": 230,
  "matching_lines": 7,
  "pattern": "TODO"
}
```

**Behavior notes:**

- When `pattern` is omitted, just return `total_lines` and omit `matching_lines`.
- When `path` is a directory, count across all files in it (non-recursively) and return an aggregate. Optionally include a per-file breakdown.
- This is a convenience tool. If it's expensive to implement, it's fine to defer it — the agent can approximate with `search_text` + `max_results: 0` if you add a `count_only` flag there instead.

**Example — agent checks how many TODOs are in the project:**

```
Tool call: count_lines({ path: "src", pattern: "TODO", is_regex: false })
```

---

### 8. search_symbol

Helps the agent find function, class, and variable definitions without reading every file. Even a simple regex-based implementation is extremely valuable. This is the closest thing to an LSP the agent gets.

**Parameters:**

| Name    | Type     | Required | Description                                                                       |
|---------|----------|----------|-----------------------------------------------------------------------------------|
| `name`  | string   | yes      | Symbol name or partial name to search for.                                        |
| `kind`  | string   | no       | Filter by kind: `"function"`, `"class"`, `"interface"`, `"variable"`, `"type"`, `"any"`. Defaults to `"any"`. |
| `path`  | string   | no       | Directory scope. Defaults to `""`.                                                |

**Response:**

```json
{
  "success": true,
  "name": "authenticateUser",
  "matches": [
    {
      "path": "src/auth/login.ts",
      "line": 82,
      "kind": "function",
      "signature": "async function authenticateUser(email: string, password: string): Promise<User>"
    },
    {
      "path": "src/auth/types.ts",
      "line": 15,
      "kind": "type",
      "signature": "type authenticateUserOptions = { ... }"
    }
  ]
}
```

**Behavior notes:**

- At minimum, implement this with regex heuristics per language:
  - JS/TS: `function name`, `const name =`, `class name`, `interface name`, `type name =`, `export default`, arrow functions assigned to variables.
  - Python: `def name`, `class name`, `name =`.
  - Go: `func name`, `func (receiver) name`, `type name struct`, `type name interface`.
  - Extend per the languages your users work with.
- Partial matching: if `name` is `"auth"`, match `"authenticateUser"`, `"authMiddleware"`, etc. Prefix matching is sufficient.
- `signature` should be the full line (or first line of multi-line signatures). Don't try to parse ASTs — the raw line is good enough.
- If a proper language server or tree-sitter integration becomes available later, swap the implementation under the same interface.

**Example — agent traces a function definition:**

```
Agent: Where is validateToken defined?
Tool call: search_symbol({ name: "validateToken", kind: "function" })
```

---

## Write Tools

All write tools mutate the virtual filesystem. The implementation must decide how these mutations are persisted (in-memory for the session, pushed to a branch, staged as a patch, etc.). That's an infrastructure decision outside this spec — from the agent's perspective, writes are immediate and durable within the session.

**Common validation for all write tools:**

- Reject paths containing `..` or starting with `/`.
- Reject writes to common protected paths: `.git/`, `node_modules/`, `.env` files (make this configurable).
- Return clear errors for permission/validation failures.

---

### 9. create_file

Creates a new file. Fails if the file already exists (use `edit_file` to modify existing files). The implementation should auto-create intermediate directories.

**Parameters:**

| Name      | Type   | Required | Description                                           |
|-----------|--------|----------|-------------------------------------------------------|
| `path`    | string | yes      | Relative path for the new file.                       |
| `content` | string | yes      | Full content of the file.                             |

**Response:**

```json
{
  "success": true,
  "path": "src/auth/two-factor.ts",
  "lines_written": 48
}
```

**Behavior notes:**

- If the file already exists, return `"error": "File already exists. Use edit_file to modify it."` with `success: false`. This prevents accidental overwrites.
- Auto-create parent directories as needed — the agent shouldn't have to call a `mkdir` tool.
- Validate that `content` is valid UTF-8 text.
- Optional: return a `size_bytes` field.

**Example — agent scaffolds a new module:**

```
Tool call: create_file({
  path: "src/auth/two-factor.ts",
  content: "import { generateTOTP } from './crypto';\n\nexport async function verify2FA(token: string): Promise<boolean> {\n  // Implementation\n  return false;\n}\n"
})
```

---

### 10. edit_file

Modifies an existing file. This is the most nuanced write tool — the editing model you choose here will significantly affect agent reliability.

**Recommended approach: search-and-replace operations.** The agent provides one or more `(old_text, new_text)` pairs. This is what Claude Code's `Edit` tool uses, and models are well-trained on this pattern. It avoids the agent having to reason about line numbers that may shift between reads and writes.

**Parameters:**

| Name      | Type     | Required | Description                                                                            |
|-----------|----------|----------|----------------------------------------------------------------------------------------|
| `path`    | string   | yes      | Relative path of the file to edit.                                                     |
| `edits`   | Edit[]   | yes      | Array of edit operations, applied sequentially.                                        |

**Edit object:**

| Name       | Type   | Required | Description                                                                           |
|------------|--------|----------|---------------------------------------------------------------------------------------|
| `old_text` | string | yes      | Exact text to find in the file. Must match exactly once.                              |
| `new_text` | string | yes      | Replacement text. Use `""` (empty string) to delete the matched section.              |

**Response:**

```json
{
  "success": true,
  "path": "src/auth/login.ts",
  "edits_applied": 2,
  "new_line_count": 235
}
```

**Behavior notes:**

- Each `old_text` must match **exactly once** in the file. If it matches zero times, return `"error": "old_text not found in file"`. If it matches more than once, return `"error": "old_text matches multiple locations, be more specific"`. This prevents ambiguous edits.
- Edits in the array are applied **sequentially** — the second edit operates on the file as modified by the first. Document this clearly for the agent.
- Whitespace matters. The agent must provide `old_text` with exact indentation. This is intentional — it forces precise edits.
- Consider also supporting a fallback `full_content` parameter that replaces the entire file. This is useful when the agent wants to rewrite a small file completely. If `full_content` is provided, `edits` should be absent, and vice versa.

**Example — agent fixes a security issue:**

```
Tool call: edit_file({
  path: "src/utils/template.ts",
  edits: [
    {
      old_text: "    const result = eval(userInput);",
      new_text: "    const result = safeEvaluate(userInput);"
    },
    {
      old_text: "import { render } from './render';",
      new_text: "import { render } from './render';\nimport { safeEvaluate } from './sandbox';"
    }
  ]
})
```

**Why not line-number-based editing?**

Line numbers drift. If the agent reads a file at line 42, then makes an edit that adds 3 lines above it, line 42 is now line 45. Search-and-replace is stable across interleaved reads and writes. Models are also better at generating exact text matches than tracking line arithmetic.

---

### 11. delete_file

Removes a file from the virtual filesystem.

**Parameters:**

| Name   | Type   | Required | Description                       |
|--------|--------|----------|-----------------------------------|
| `path` | string | yes      | Relative path to the file.        |

**Response:**

```json
{
  "success": true,
  "path": "src/deprecated/old-auth.ts",
  "deleted": true
}
```

**Behavior notes:**

- If the file doesn't exist, return `"error": "File not found"` with `success: false`.
- Do not support recursive directory deletion in v1. If the agent tries to delete a directory, return `"error": "Cannot delete directories. Delete files individually."` This is a safety guardrail.
- Consider requiring a confirmation mechanism for sensitive paths (e.g., config files, entry points). This can be implemented at the agent orchestration layer rather than in the tool itself.

---

### 12. rename_file

Moves or renames a file. Combines `mv` and `rename` semantics.

**Parameters:**

| Name       | Type   | Required | Description                       |
|------------|--------|----------|-----------------------------------|
| `old_path` | string | yes      | Current relative path.            |
| `new_path` | string | yes      | Target relative path.             |

**Response:**

```json
{
  "success": true,
  "old_path": "src/auth/login.ts",
  "new_path": "src/auth/sign-in.ts"
}
```

**Behavior notes:**

- If `new_path` already exists, return `"error": "Target path already exists"` with `success: false`.
- Auto-create intermediate directories for `new_path`.
- Apply the same path validation as other write tools (no `..`, no absolute paths).
- This tool handles both renames (same directory, new name) and moves (different directory).

---

## Error Handling

All tools share a consistent error format:

```json
{
  "success": false,
  "error": "Human-readable description of what went wrong.",
  "error_code": "FILE_NOT_FOUND"
}
```

**Standard error codes:**

| Code                    | Meaning                                                    |
|-------------------------|------------------------------------------------------------|
| `FILE_NOT_FOUND`        | Path does not exist.                                       |
| `ALREADY_EXISTS`        | File already exists (for `create_file`, `rename_file`).    |
| `INVALID_PATH`          | Path contains `..`, starts with `/`, or is otherwise malformed. |
| `PERMISSION_DENIED`     | Path is in a protected location.                           |
| `BINARY_FILE`           | Operation not supported on binary files.                   |
| `AMBIGUOUS_MATCH`       | `old_text` in `edit_file` matched more than once.          |
| `MATCH_NOT_FOUND`       | `old_text` in `edit_file` matched zero times.              |
| `TOO_LARGE`             | File or result set exceeds size limits.                    |
| `INVALID_PARAMETER`     | A required parameter is missing or has an invalid value.   |

---

## Implementation Notes

### Caching strategy

Since the backing store is likely a remote Git provider API, implement a lazy in-memory cache:

1. First `read_file` for a given path → fetch from API, cache in a `Map<string, FileEntry>`.
2. Subsequent reads → serve from cache.
3. Write operations → update the cache immediately. Whether/how to persist writes to the remote is an infrastructure decision.
4. `search_text` and `find_files` may require bulk-fetching the file tree index on first call. Cache the tree structure separately from file contents.

### Token budget awareness

The agent operates within a context window. Tools should help it stay within budget:

- `read_file` with ranges, `get_file_metadata`, and `count_lines` exist specifically so the agent can probe before committing to large reads.
- Consider adding a `"token_estimate"` field to `read_file` responses (rough: `chars / 4`) so the agent can budget.
- Truncate large responses with a `"truncated": true` flag rather than failing silently.

### Tool registration

When registering these tools with the LLM, provide the tool descriptions in a way that guides correct usage. Example for `read_file`:

```json
{
  "name": "read_file",
  "description": "Read the content of a file. Use start_line/end_line to read specific sections of large files. Check get_file_metadata first if you're unsure about file size.",
  "parameters": { ... }
}
```

Good descriptions reduce misuse. Mention related tools in each description (e.g., "Use search_text to find occurrences before reading" in `read_file`'s description).

---

## Future Versions

**v2 — Git operations (planned):**
- `get_diff` (base, head, file-scoped diffs)
- `get_git_log` (commit history, filterable by path/author)
- `get_git_blame` (line-level authorship)
- `get_commit_detail` (full commit info)
- `create_branch`, `commit_changes`, `create_pr`

**v3 — Review annotations (planned):**
- `post_review_comment` (inline PR comments)
- `post_review_summary` (top-level review)
- `add_label`, `request_changes`, `approve`

