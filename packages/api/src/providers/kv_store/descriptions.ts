/**
 * Shared description strings for KV store tools.
 *
 * These are the agent-facing texts that explain each tool, field, and value
 * to the LLM. Both the Zod schemas (`buildTools.ts`) and the JSON Schema
 * mirrors (`descriptors.ts`) MUST use the exact same wording so that whichever
 * surface the LLM sees, it receives identical information.
 */

/* ─── Tool-level descriptions ─── */

export const LIST_KEYS_TOOL_DESC =
  'List all keys in the bound KV store for the current tenant (paginated). ' +
  'Returns every stored key including `_sys.`-prefixed system keys (which are read-only to agents). ' +
  'Use this to discover what data exists before deciding to read specific values with `get_values`, ' +
  'or to enumerate state. Prefer `search` when you know part of a key name.';

export const GET_VALUES_TOOL_DESC =
  'Fetch the values for an explicit list of keys (up to 100 per call). ' +
  'Returns a `{ key: value }` map where missing keys map to `null` ' +
  '(distinct from an empty string `""`, which means the key exists and holds an empty value). ' +
  'Use this when you already know the keys you need; otherwise use `list_keys` or `search` first.';

export const SEARCH_TOOL_DESC =
  'Search KV entries by substring (case-insensitive ILIKE) or POSIX regex (RE2 engine, linear-time, ' +
  'safe from catastrophic backtracking). Use mode="substring" for simple keyword lookups; use mode="regex" ' +
  'only when you need a structured pattern. Regex scans are bounded to a 10,000-row sample for safety — ' +
  'narrow with a more specific pattern if your data exceeds that. Returns matching `{ key, value }` pairs.';

export const UPDATE_VALUE_TOOL_DESC =
  'Insert or update a value for a key (upsert). ' +
  'Writes are BLOCKED for keys starting with `_sys.` (case-insensitive): those are system-managed and ' +
  'protected — the call will fail with ToolError code `protected_key`. ' +
  'Key max 256 bytes; value max 256 KB. Returns `{ success: true }` on success.';

/* ─── Field descriptions (shared by Zod + JSON) ─── */

export const OFFSET_DESC =
  'Zero-based pagination offset. Defaults to 0 (first page). ' +
  'Combined with `limit`, the maximum reachable index is ~1000 — beyond that the result is clamped ' +
  'and the response sets `truncated: true`, meaning you should narrow the query instead of walking deeper.';

export const LIST_KEYS_LIMIT_DESC =
  'Maximum number of keys to return in one page. Range 1–500. Defaults to 100.';

export const SEARCH_LIMIT_DESC =
  'Maximum number of matching entries to return in one page. Range 1–500. Defaults to 50.';

export const GET_VALUES_KEYS_DESC =
  'Explicit list of keys to look up (max 100 per call, each key ≤ 256 bytes). ' +
  'Missing keys are returned as `null` in the response map.';

export const SEARCH_MODE_DESC =
  'How to match entries against the input: ' +
  '"substring" performs a case-insensitive substring (ILIKE) match using `query`; ' +
  '"regex" compiles `pattern` as an RE2-compatible POSIX regex and scans up to 10,000 rows.';

export const SEARCH_ON_DESC =
  'Which field(s) of each entry to match against: ' +
  '"keys" matches only the key text, "values" matches only the value text, ' +
  '"both" matches if either matches (case-insensitive for substring mode). Defaults to "both".';

export const SEARCH_QUERY_DESC =
  'The substring to search for (case-insensitive). REQUIRED when mode="substring" — ignored when mode="regex". ' +
  'Max 2048 characters.';

export const SEARCH_PATTERN_DESC =
  'The RE2-compatible POSIX regex pattern to scan for. REQUIRED when mode="regex" — ignored when ' +
  'mode="substring". Max 1024 characters. Linear-time engine — no lookaround or backreferences.';

export const UPDATE_KEY_DESC =
  'The key to write. 1–256 bytes. Keys with the `_sys.` prefix (case-insensitive) are reserved for the ' +
  'system and will be rejected with ToolError code `protected_key`.';

export const UPDATE_VALUE_DESC =
  'The value to store under `key`. Max 256 KB (262,144 bytes). Overwrites any previous value at this key.';

/* ─── Pagination response shape descriptions (for any future response schemas) ─── */

export const RESPONSE_TOTAL_DESC = 'Total number of matching items in the store (may exceed `limit`).';
export const RESPONSE_OFFSET_DESC =
  'The `offset` actually used (echoed back; defaulted when omitted in input).';
export const RESPONSE_LIMIT_DESC =
  'The `limit` actually used (echoed back; defaulted when omitted in input).';
export const RESPONSE_TRUNCATED_DESC =
  'Present and `true` only when (offset + limit) was clamped to MAX_OFFSET. Signals you should narrow the query.';
