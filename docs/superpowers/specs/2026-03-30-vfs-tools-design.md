# Spec 2: VFS Tools

The 12 tool functions that form the agent-facing API over the VFS core. Each tool is a thin adapter: validate input, call `VFSContext` methods, shape the response per the spec.

## Tool Registration

VFS tools use a separate registration path from regular tools, ensuring compile-time safety:

```typescript
// Regular tools — always registered
generateAllTools(context: Context): Record<string, Tool>

// VFS tools — only called when the agent has VFS enabled
generateVFSTools(context: Context, vfs: VFSContext): Record<string, Tool>
```

In the Edge Function:

```typescript
const tools: Record<string, Tool> = {
  ...generateAllTools(context),
  ...(agentHasVFS ? generateVFSTools(context, vfsContext) : {}),
};
```

`vfs: VFSContext` is a required parameter — TypeScript enforces it at compile time. No optional types, no runtime assertions.

## File Layout

```
packages/api/src/vfs/tools/
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
  symbolPatterns.ts   — regex heuristics per language for searchSymbol
  index.ts            — exports generateVFSTools
```

## Tool Descriptions — Two Layers

1. **Short description in the tool schema** — one sentence, what the tool does. Included in every LLM request.
2. **Cross-tool guidance in a system prompt preamble** — injected once when VFS is enabled. Contains usage patterns like "use `get_file_metadata` before reading large files" and "use `search_text` to find relevant sections instead of reading entire files."

## Response Types

Each tool has a typed response interface. Example:

```typescript
interface ReadFileResponse {
  success: true;
  path: string;
  content: string;
  start_line: number;
  end_line: number;
  total_lines: number;
  token_estimate: number;
}
```

On error, tools catch `VFSError` and return:

```typescript
interface VFSToolErrorResponse {
  success: false;
  error: string;
  error_code: VFSErrorCode;
  details?: Record<string, unknown>;  // extra info from VFSError.details (e.g., totalLines, tokenEstimate)
}
```

## Tool Specifications

### Read Tools

#### 1. read_file

Parameters: `path` (required), `start_line` (optional), `end_line` (optional).

- Returns full file or requested range with `total_lines` and `token_estimate` (chars / 4).
- Hard ceiling: if requested content exceeds 10,000 lines, returns `TOO_LARGE` error with `total_lines` and `token_estimate` in the error response. No truncation.
- Binary files return `BINARY_FILE` error.

#### 2. list_directory

Parameters: `path` (optional, default root), `recursive` (optional, default false), `max_depth` (optional, default 2).

- Returns entries with `name` and `type` ("file" or "directory").
- Sorted: directories first, then files, both alphabetically.
- Default ignores applied (`.git`, `node_modules`, `__pycache__`, `.next`, `dist`, `build`).
- When recursive, returns flattened entries with full relative paths.

#### 3. find_files

Parameters: `pattern` (required, glob), `path` (optional), `exclude` (optional, glob array), `max_results` (optional, default 100).

- Standard glob syntax: `*`, `**`, `?`.
- Default ignores applied plus user-provided `exclude`.
- Returns paths relative to repo root.
- Sets `truncated: true` if matches exceed `max_results`.

#### 4. search_text

Parameters: `pattern` (required), `is_regex` (optional, default false), `path` (optional), `include_glob` (optional), `ignore_case` (optional, default false), `max_results` (optional, default 50).

- Tree-guided selective fetch: filters candidates via tree index, fetches through normal read path with concurrency pool of ~10, consistent regex support.
- If candidate set exceeds search candidate limit (default 200), returns `TOO_LARGE` error with a message to narrow scope.
- Each match includes 2 lines of context above and below.
- Binary files skipped silently.
- Sets `truncated: true` if total matches exceed `max_results`.

#### 5. get_file_metadata

Parameters: `path` (required).

- Returns `size_bytes`, `line_count` (nullable), `language`, `is_binary`.
- Served entirely from tree index (size) + extension-to-language utility + in-memory cache (line count if file has been read).
- If the file hasn't been read yet, `line_count` is `null`. The agent can call `read_file` first if it needs an exact count.
- No source provider call needed.
- `language` inferred from file extension.

#### 6. get_file_tree

Parameters: `path` (optional, default root), `max_depth` (optional, default 3).

- Returns nested tree structure with `name`, `type`, `size_bytes`, `language` on file nodes.
- Default ignores applied.
- Cap at 500 total nodes; sets `truncated: true` if exceeded.

#### 7. count_lines

Parameters: `path` (required, file only), `pattern` (optional), `is_regex` (optional, default false).

- File-only for v1. No directory mode.
- When `pattern` omitted, returns `total_lines` only.
- When `pattern` provided, returns `total_lines` and `matching_lines`.

#### 8. search_symbol

Parameters: `name` (required), `kind` (optional: "function", "class", "interface", "variable", "type", "any"; default "any"), `path` (optional).

- Regex heuristics per language. v1 supports JS/TS, Python, Go.
- Patterns defined in separate `symbolPatterns.ts` module.
- Partial/prefix matching: "auth" matches "authenticateUser", "authMiddleware".
- Returns `path`, `line`, `kind`, `signature` (full line) per match.
- For unsupported languages (not JS/TS, Python, or Go), returns empty results — no error. The agent can fall back to `search_text` for those files.

### Write Tools

Common validation for all write tools:
- Reject paths with `..` or starting with `/`.
- Reject writes to hardcoded blocked paths (`.git/**` — always).
- Reject writes to configurable blocked paths (default: `node_modules/**`, `.env`, `.env.*`).

#### 9. create_file

Parameters: `path` (required), `content` (required).

- Fails if file already exists (`ALREADY_EXISTS`).
- Auto-creates intermediate directories in the tree index.
- Returns `lines_written`.

#### 10. edit_file

Parameters: `path` (required), `edits` (optional, Edit[]), `full_content` (optional, string).

- **Hard mutual exclusivity:** if both `edits` and `full_content` provided, `INVALID_PARAMETER` error. If neither, `INVALID_PARAMETER` error.
- **Atomic edits:** edits applied sequentially on a copy. If any edit fails, file is unchanged. Error says which edit failed and why.
- Each `old_text` must match exactly once. Zero matches: `MATCH_NOT_FOUND`. Multiple matches: `AMBIGUOUS_MATCH`.
- `full_content` replaces the entire file.
- Returns `edits_applied` and `new_line_count`.

#### 11. delete_file

Parameters: `path` (required).

- File only — no recursive directory deletion in v1.
- Returns `deleted: true`.

#### 12. rename_file

Parameters: `old_path` (required), `new_path` (required).

- Fails if `new_path` already exists (`ALREADY_EXISTS`).
- Auto-creates intermediate directories.
- Both rename (same dir) and move (different dir) supported.
