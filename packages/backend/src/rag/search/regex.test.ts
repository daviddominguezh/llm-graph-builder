import { ToolError } from '@daviddh/llm-graph-runner';
import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { RegexSearchResult } from '../../db/queries/ragChunksQueries.js';
import { runRegexSearch } from './regex.js';

const fakeSupabase = {} as unknown as SupabaseClient;

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
  offset: 0,
  limit: 10,
};

type SearchFn = (
  client: SupabaseClient,
  input: { storeId: string; tenantId: string; pattern: string; offset: number; limit: number }
) => Promise<RegexSearchResult>;

function withResult(result: RegexSearchResult): SearchFn {
  return jest.fn<SearchFn>().mockResolvedValue(result);
}

describe('runRegexSearch', () => {
  it('returns paginated result on success', async () => {
    const fn = withResult({
      result: [hit('1', 'foo and bar'), hit('2', 'foo bar')],
      total: 2,
      error: null,
      timedOut: false,
    });
    const res = await runRegexSearch(fakeSupabase, baseParams, fn);
    expect(res.items).toEqual(['foo and bar', 'foo bar']);
    expect(res.total).toBe(2);
    expect(res.offset).toBe(0);
    expect(res.limit).toBe(10);
  });

  it('throws pattern_timeout on timedOut response', async () => {
    const fn = withResult({ result: [], total: 0, error: null, timedOut: true });
    await expect(runRegexSearch(fakeSupabase, baseParams, fn)).rejects.toMatchObject({
      name: 'ToolError',
      code: 'pattern_timeout',
    });
  });

  it('throws invalid_pattern when pattern exceeds length cap', async () => {
    const longPattern = 'a'.repeat(2000);
    const fn = withResult({ result: [], total: 0, error: null, timedOut: false });
    await expect(
      runRegexSearch(fakeSupabase, { ...baseParams, pattern: longPattern }, fn)
    ).rejects.toMatchObject({ name: 'ToolError', code: 'invalid_pattern' });
  });

  it('throws invalid_pattern when RE2 cannot compile the pattern', async () => {
    const fn = withResult({ result: [], total: 0, error: null, timedOut: false });
    await expect(
      runRegexSearch(fakeSupabase, { ...baseParams, pattern: '(unbalanced' }, fn)
    ).rejects.toBeInstanceOf(ToolError);
  });

  it('throws invalid_pattern when RPC returns a SQL error', async () => {
    const fn = withResult({ result: [], total: 0, error: 'invalid pattern from DB', timedOut: false });
    await expect(runRegexSearch(fakeSupabase, baseParams, fn)).rejects.toMatchObject({
      name: 'ToolError',
      code: 'invalid_pattern',
    });
  });
});
