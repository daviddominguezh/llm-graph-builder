/**
 * Shared description strings for KV store tools.
 *
 * These are the agent-facing texts that explain each tool, field, and value
 * to the LLM. Both the Zod schemas (`buildTools.ts`) and the JSON Schema
 * mirrors (`descriptors.ts`) MUST use the exact same wording so that whichever
 * surface the LLM sees, it receives identical information.
 *
 * Style: describe behavior + capabilities + constraints. Skip implementation
 * details (engine names, internal timeouts, SQL operator names, etc.) — they
 * add tokens without helping the agent make decisions.
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
  'Search KV entries by substring or regex. Use mode="substring" for simple keyword lookups; use ' +
  'mode="regex" only when you need a structured pattern. Regex scans are bounded to a sample for safety — ' +
  'narrow with a more specific pattern if your data exceeds it. ' +
  'Returns `{ items, limit, nextCursor }`; page by passing `nextCursor` back as `cursor` until it is `null`.';

export const UPDATE_VALUE_TOOL_DESC =
  'Insert or update a value for a key (upsert). ' +
  'Writes are BLOCKED for keys starting with `_sys.` (case-insensitive): those are system-managed and ' +
  'protected — the call will fail with ToolError code `protected_key`. ' +
  'Key max 256 bytes; value max 256 KB. Returns `{ success: true }` on success.';

/* ─── Field descriptions (shared by Zod + JSON) ─── */

export const CURSOR_DESC =
  'Opaque continuation token. Omit on the first call. To get the next page, pass back the ' +
  '`nextCursor` value from the previous response verbatim — do not parse or construct it yourself.';

export const LIST_KEYS_LIMIT_DESC =
  'Maximum number of keys to return in one page. Range 1–500. Defaults to 100.';

export const SEARCH_LIMIT_DESC =
  'Maximum number of matches to return per page. Range 1–500. Defaults to 50.';

export const GET_VALUES_KEYS_DESC =
  'Explicit list of keys to look up (max 100 per call, each key ≤ 256 bytes). ' +
  'Missing keys are returned as `null` in the response map.';

export const SEARCH_MODE_DESC =
  'How to match entries against `query`: ' +
  '"substring" performs a case-insensitive substring match; ' +
  '"regex" interprets `query` as a regex pattern.';

export const SEARCH_ON_DESC =
  'Which field(s) of each entry to match against: ' +
  '"keys" matches only the key text, "values" matches only the value text, ' +
  '"both" matches if either matches. Defaults to "both".';

export const SEARCH_QUERY_DESC =
  'What to search for. When mode="substring": a case-insensitive substring (max 2048 chars). ' +
  'When mode="regex": a regex pattern (max 1024 chars; no lookaround or backreferences).';

export const UPDATE_KEY_DESC =
  'The key to write. 1–256 bytes. Keys with the `_sys.` prefix (case-insensitive) are reserved for the ' +
  'system and will be rejected with ToolError code `protected_key`.';

export const UPDATE_VALUE_DESC =
  'The value to store under `key`. Max 256 KB (262,144 bytes). Overwrites any previous value at this key.';

/* ─── Pagination response shape descriptions (for any future response schemas) ─── */

export const RESPONSE_LIMIT_DESC =
  'The `limit` actually used (echoed back; defaulted when omitted in input).';
export const NEXT_CURSOR_DESC =
  'Opaque token for the next page, or `null` when there are no more matches. ' +
  'Keep calling with this value (as `cursor`) until it is `null` to page through all matches.';
