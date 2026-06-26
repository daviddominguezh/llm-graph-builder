import { describe, expect, it } from '@jest/globals';

import type { KvRegexArgs, KvSearchArgs, RagSearchArgs, SearchPage } from '../types.js';

const KV_LIMIT = 10;
const PAGE_LIMIT = 1;
const RAG_MIN_SIMILARITY = 0.5;
const RAG_LIMIT = 5;

describe('search contract shape (compile-time)', () => {
  it('KvSearchArgs uses cursor not offset', () => {
    const args: KvSearchArgs = { tenantId: 't', on: 'both', query: 'q', limit: KV_LIMIT, cursor: 'c' };
    expect(args.cursor).toBe('c');
    // @ts-expect-error offset must no longer exist on the args type
    const hasOffset: unknown = args.offset;
    expect(hasOffset).toBeUndefined();
  });

  it('SearchPage exposes nextCursor and no total', () => {
    const page: SearchPage<string> = { items: ['a'], limit: PAGE_LIMIT, nextCursor: null };
    expect(page.nextCursor).toBeNull();
    // @ts-expect-error total was dropped from the page contract
    const hasTotal: unknown = page.total;
    expect(hasTotal).toBeUndefined();
  });

  it('RagRegexArgs and RagSearchArgs carry cursor', () => {
    const r: RagSearchArgs = {
      tenantId: 't',
      query: 'q',
      minSimilarity: RAG_MIN_SIMILARITY,
      limit: RAG_LIMIT,
    };
    const rx: KvRegexArgs = { tenantId: 't', on: 'keys', pattern: 'p', limit: RAG_LIMIT };
    expect(r.cursor).toBeUndefined();
    expect(rx.cursor).toBeUndefined();
  });
});
