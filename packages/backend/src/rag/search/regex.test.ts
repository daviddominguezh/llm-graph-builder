import { ToolError } from '@daviddh/llm-graph-runner';
import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { RegexSearchResult } from '../../db/queries/ragRegexQueries.js';
import { runRegexSearch } from './regex.js';

const ZERO = 0;
const TWO = 2;
const TEN = 10;
const PATTERN_OVER_LIMIT = 2000;

// The supabase client is never actually called — the search function is stubbed.
const mockCreateSupabase = jest.fn<() => SupabaseClient>();
const fakeSupabase = mockCreateSupabase();

interface Hit {
  id: string;
  content: string;
  page_number: number | null;
  rag_file_id: string;
}

function hit(id: string, content: string): Hit {
  return { id, content, page_number: null, rag_file_id: 'f1' };
}

const baseParams = {
  storeId: 's1',
  tenantId: 't1',
  pattern: 'foo.*bar',
  offset: ZERO,
  limit: TEN,
};

type SearchFn = (
  client: SupabaseClient,
  input: { storeId: string; tenantId: string; pattern: string; offset: number; limit: number }
) => Promise<RegexSearchResult>;

function withResult(result: RegexSearchResult): SearchFn {
  return jest.fn<SearchFn>().mockResolvedValue(result);
}

describe('runRegexSearch — success', () => {
  it('returns paginated result on success', async () => {
    const fn = withResult({
      result: [hit('1', 'foo and bar'), hit('2', 'foo bar')],
      total: TWO,
      error: null,
      timedOut: false,
    });
    const res = await runRegexSearch(fakeSupabase, baseParams, fn);
    expect(res.items).toEqual(['foo and bar', 'foo bar']);
    expect(res.total).toBe(TWO);
    expect(res.offset).toBe(ZERO);
    expect(res.limit).toBe(TEN);
  });
});

describe('runRegexSearch — error mapping', () => {
  it('throws pattern_timeout on timedOut response', async () => {
    const fn = withResult({ result: [], total: ZERO, error: null, timedOut: true });
    await expect(runRegexSearch(fakeSupabase, baseParams, fn)).rejects.toMatchObject({
      name: 'ToolError',
      code: 'pattern_timeout',
    });
  });

  it('throws invalid_pattern when pattern exceeds length cap', async () => {
    const longPattern = 'a'.repeat(PATTERN_OVER_LIMIT);
    const fn = withResult({ result: [], total: ZERO, error: null, timedOut: false });
    await expect(
      runRegexSearch(fakeSupabase, { ...baseParams, pattern: longPattern }, fn)
    ).rejects.toMatchObject({ name: 'ToolError', code: 'invalid_pattern' });
  });

  it('throws invalid_pattern when RE2 cannot compile the pattern', async () => {
    const fn = withResult({ result: [], total: ZERO, error: null, timedOut: false });
    await expect(
      runRegexSearch(fakeSupabase, { ...baseParams, pattern: '(unbalanced' }, fn)
    ).rejects.toBeInstanceOf(ToolError);
  });

  it('throws invalid_pattern when RPC returns a SQL error', async () => {
    const fn = withResult({ result: [], total: ZERO, error: 'invalid pattern from DB', timedOut: false });
    await expect(runRegexSearch(fakeSupabase, baseParams, fn)).rejects.toMatchObject({
      name: 'ToolError',
      code: 'invalid_pattern',
    });
  });
});
