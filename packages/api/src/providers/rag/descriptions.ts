/**
 * Shared description strings for RAG search tools.
 *
 * These are the agent-facing texts that explain the tool, its fields, and
 * the meaning of each enum value to the LLM. Both the Zod schema
 * (`buildTools.ts`) and the JSON Schema mirror (`descriptors.ts`) MUST use the
 * exact same wording so that whichever surface the LLM sees, it receives
 * identical information.
 */

/* ─── Tool-level description ─── */

export const RAG_SEARCH_TOOL_DESC =
  'Search the bound RAG (knowledge-base) store for chunks relevant to a query. ' +
  'Choose `mode` based on the kind of query:\n' +
  '  • `bm25`     — lexical keyword + frequency scoring (Postgres FTS). Best for exact terms, IDs, ' +
  'proper nouns, and codes where the wording is known.\n' +
  '  • `semantic` — vector similarity over text embeddings. Best for natural-language meaning when the ' +
  'exact wording is likely to differ.\n' +
  '  • `hybrid`   — combines `semantic` + `bm25` (runs both and merges by score). Use when unsure which ' +
  'would win — usually the safest default for general questions.\n' +
  '  • `regex`    — POSIX regex via Postgres (500ms server-side timeout). Use ONLY for structured ' +
  'patterns (emails, IDs, SKUs, error codes). Slower than the others; prefer `bm25` unless you truly ' +
  'need a pattern.\n' +
  'Returns paginated `{ items: string[], total, offset, limit, truncated? }` where `items` are the top ' +
  'matching chunk texts.';

/* ─── Field descriptions ─── */

export const RAG_MODE_DESC =
  'Which search strategy to use. ' +
  '"bm25" = lexical keyword/frequency (Postgres FTS), best for exact terms and known wording. ' +
  '"semantic" = vector similarity over embeddings, best for meaning when wording differs. ' +
  '"hybrid" = blends semantic + bm25, safest default when unsure. ' +
  '"regex" = POSIX regex (500ms timeout), only for structured patterns like emails or SKUs.';

export const RAG_QUERY_DESC =
  'The search input. REQUIRED for modes "bm25", "semantic", and "hybrid". Ignored for mode "regex". ' +
  'Max 4096 characters. For "bm25" pass keyword(s); for "semantic"/"hybrid" pass a natural-language phrase.';

export const RAG_PATTERN_DESC =
  'The POSIX regex pattern to match against chunk content. REQUIRED when mode="regex". ' +
  'Ignored for other modes. Max 1024 characters. Server-side statement timeout: 500ms.';

export const RAG_MIN_SIMILARITY_DESC =
  'Minimum cosine-similarity floor for embedding matches. Range 0.0–1.0; defaults to 0.5. ' +
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
  'Present and `true` only when (offset + limit) was clamped to MAX_OFFSET. Signals you should narrow the query.';
