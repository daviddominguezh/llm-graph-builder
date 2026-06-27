import { ToolError } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RE2JS } from 're2js';

import { type RegexSearchResult, searchByRegex } from '../../db/queries/ragRegexQueries.js';
import { type PaginatedSearchResult, type RegexSearchParams, clampOffset } from './types.js';

type RegexSearchFn = (
  supabase: SupabaseClient,
  input: { storeId: string; tenantId: string; pattern: string; offset: number; limit: number }
) => Promise<RegexSearchResult>;

const MAX_PATTERN_LENGTH = 1024;

function preValidatePattern(pattern: string): void {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new ToolError('invalid_pattern', `Pattern exceeds ${String(MAX_PATTERN_LENGTH)} chars`);
  }
  try {
    // Compile-only: rejects malformed/linear-blowup patterns before they reach
    // Postgres. re2js is pure-JS (no native addon) and linear-time.
    RE2JS.compile(pattern);
  } catch (err) {
    throw new ToolError('invalid_pattern', err instanceof Error ? err.message : 'invalid regex');
  }
}

function buildResult(
  items: string[],
  total: number,
  clamp: { offset: number; truncated: boolean },
  limit: number
): PaginatedSearchResult {
  if (clamp.truncated) {
    return { items, total, offset: clamp.offset, limit, truncated: true };
  }
  return { items, total, offset: clamp.offset, limit };
}

// runRegexSearch — paginated POSIX-regex search over rag_chunks for the agent path.
//
// Pre-validates the pattern with re2js to reject malformed/linear-blowup regex
// patterns before sending to Postgres. The RPC also enforces a 500ms statement timeout
// as a second line of defense; we surface that as a `pattern_timeout` ToolError.
//
// The `_searchFn` parameter is exposed only for unit tests (ESM module mocking
// is brittle); production callers always omit it.
export async function runRegexSearch(
  supabase: SupabaseClient,
  params: RegexSearchParams,
  _searchFn: RegexSearchFn = searchByRegex
): Promise<PaginatedSearchResult> {
  preValidatePattern(params.pattern);
  const clamp = clampOffset(params.offset, params.limit);
  const res = await _searchFn(supabase, {
    storeId: params.storeId,
    tenantId: params.tenantId,
    pattern: params.pattern,
    offset: clamp.offset,
    limit: params.limit,
  });
  if (res.timedOut) throw new ToolError('pattern_timeout', 'Regex pattern timed out (500ms)');
  if (res.error !== null) throw new ToolError('invalid_pattern', res.error);
  const items = res.result.map((r) => r.content);
  return buildResult(items, res.total, clamp, params.limit);
}
