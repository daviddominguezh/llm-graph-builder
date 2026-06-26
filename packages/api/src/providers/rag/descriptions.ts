/**
 * Shared description strings for RAG search tools.
 *
 * These are the agent-facing texts that explain the tool, its fields, and
 * the meaning of each enum value to the LLM. Both the Zod schema
 * (`buildTools.ts`) and the JSON Schema mirror (`descriptors.ts`) MUST use the
 * exact same wording so that whichever surface the LLM sees, it receives
 * identical information.
 *
 * Style: describe behavior + capabilities + constraints. Skip implementation
 * details (engine names, internal timeouts, SQL operator names, etc.).
 */

/* ─── Tool-level description ─── */

export const RAG_SEARCH_TOOL_DESC =
  'Search the bound RAG (knowledge-base) store for chunks relevant to a query. ' +
  'Choose `mode` based on the kind of query:\n' +
  '  • `bm25`     — keyword + frequency scoring. Best for exact terms, IDs, proper nouns, and codes ' +
  'where the wording is known.\n' +
  '  • `semantic` — meaning-based vector match. Best for natural-language meaning when the exact ' +
  'wording is likely to differ.\n' +
  '  • `hybrid`   — combines `semantic` + `bm25` and merges by score. Use when unsure which would ' +
  'win — usually the safest default for general questions.\n' +
  '  • `regex`    — regex pattern. Use ONLY for structured patterns (emails, IDs, SKUs, error codes). ' +
  'Slower than the others; prefer `bm25` unless you truly need a pattern.\n' +
  'Returns paginated `{ items: string[], total, offset, limit, truncated? }` where `items` are the top ' +
  'matching chunk texts.';

/* ─── Field descriptions ─── */

export const RAG_MODE_DESC =
  'Which search strategy to use. ' +
  '"bm25" = keyword/frequency match, best for exact terms and known wording. ' +
  '"semantic" = meaning-based vector match, best when the wording is likely to differ. ' +
  '"hybrid" = blends semantic + bm25, safest default when unsure. ' +
  '"regex" = regex pattern, only for structured patterns like emails or SKUs.';

export const RAG_QUERY_DESC =
  'What to search for. For mode="bm25": one or more keywords (max 4096 chars). ' +
  'For mode="semantic" / "hybrid": a natural-language phrase (max 4096 chars). ' +
  'For mode="regex": a regex pattern (max 1024 chars; no lookaround or backreferences).';

export const RAG_MIN_SIMILARITY_DESC =
  'Minimum similarity floor for matches. Range 0.0–1.0; defaults to 0.5. ' +
  'ONLY applies to mode="semantic" and mode="hybrid" — ignored for "bm25" and "regex". ' +
  'Higher values (e.g. 0.7) return fewer, more precise matches; lower values (e.g. 0.3) return more ' +
  'permissive matches. Set to 0 to disable the floor entirely.';

export const RAG_OFFSET_DESC =
  'Zero-based pagination offset. Defaults to 0 (first page). ' +
  'Combined with `limit`, the maximum reachable index is ~1000 — beyond that the result is clamped ' +
  'and the response sets `truncated: true`, meaning you should narrow the query instead of walking deeper.';

export const RAG_LIMIT_DESC =
  'Maximum number of matching chunks to return in one page. Range 1–200. Defaults to 20.';

/* ─── Pagination response shape descriptions ─── */

export const RAG_RESPONSE_TOTAL_DESC = 'Total number of matching chunks in the store (may exceed `limit`).';
export const RAG_RESPONSE_OFFSET_DESC =
  'The `offset` actually used (echoed back; defaulted when omitted in input).';
export const RAG_RESPONSE_LIMIT_DESC =
  'The `limit` actually used (echoed back; defaulted when omitted in input).';
export const RAG_RESPONSE_TRUNCATED_DESC =
  'Present and `true` only when (offset + limit) was clamped. Signals you should narrow the query.';
