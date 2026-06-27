import { jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { InternalApiClient } from '../internalApiClient.js';

interface RagChunk {
  id: string;
  content: string;
}

interface PoolResult {
  rows: RagChunk[];
  error: string | null;
}

interface RerankRecord {
  id: string;
  content: string;
}

interface RerankInput {
  query: string;
  records: RerankRecord[];
  topN: number;
}

interface RerankedRecord {
  id: string;
  score: number;
}

const FIRST_VECTOR = 0.1;
const SECOND_VECTOR = 0.2;
const PAGE_LIMIT = 2;
const SEMANTIC_LIMIT = 5;
const MIN_SIM = 0.5;
const SCORE_BASE = 1;
const ONCE = 1;

// Typed jest mocks: passing the signature to `jest.fn<T>()` keeps
// `mockResolvedValue`/`mockImplementation` precise (an untyped `jest.fn()`
// collapses params to `never`) and lets assertions read `.mock.calls` without
// a type assertion.
const ftsPool = jest.fn<(supabase: unknown, args: { k: number }) => Promise<PoolResult>>();
const semanticPool =
  jest.fn<(supabase: unknown, args: { queryVector: number[]; k: number }) => Promise<PoolResult>>();

jest.unstable_mockModule('../rag/ragQueries.js', () => ({
  ftsPool,
  semanticPool,
}));

const { makeRagStoreService } = await import('../rag/ragStoreService.js');

const chunk = (id: string): RagChunk => ({ id, content: `c-${id}` });

// Reverse the pool so a passthrough vs. reranked order is observable, and stamp
// a descending score so the contract (ordered by rerank) is exercised end to end.
const embed = jest.fn<(text: string) => Promise<number[]>>(async () => {
  await Promise.resolve();
  return [FIRST_VECTOR, SECOND_VECTOR];
});
const rerank = jest.fn<(input: RerankInput) => Promise<RerankedRecord[]>>(async (input) => {
  await Promise.resolve();
  return [...input.records]
    .reverse()
    .map((r, i) => ({ id: r.id, score: input.records.length - i + SCORE_BASE }));
});

const client = { embed, rerank };

// The query layer is fully mocked, so the client is never touched — but the
// factory wants a real `SupabaseClient`. Narrow a minimal stub via a type guard
// rather than a type assertion.
function isSupabaseClient(value: unknown): value is SupabaseClient {
  return typeof value === 'object' && value !== null && 'from' in value;
}

function fakeSupabase(): SupabaseClient {
  const stub = {
    from: (): never => {
      throw new Error('supabase access is mocked in this suite');
    },
  };
  if (!isSupabaseClient(stub)) throw new Error('stub is not a supabase client');
  return stub;
}

function isClient(value: unknown): value is InternalApiClient {
  return typeof value === 'object' && value !== null && 'embed' in value && 'rerank' in value;
}

function fakeClient(): InternalApiClient {
  if (!isClient(client)) throw new Error('stub is not an internal api client');
  return client;
}

const supabase = fakeSupabase();

beforeEach(() => {
  ftsPool.mockReset();
  semanticPool.mockReset();
  embed.mockClear();
  rerank.mockClear();
});

describe('makeRagStoreService bm25', () => {
  it('reranks the pool then paginates by match count', async () => {
    ftsPool.mockResolvedValue({ rows: [chunk('a'), chunk('b'), chunk('c')], error: null });
    const svc = makeRagStoreService(supabase, 's', fakeClient());
    const page = await svc.searchBm25('t', 'q', PAGE_LIMIT);
    expect(rerank).toHaveBeenCalledTimes(ONCE);
    expect(page.items).toEqual(['c-c', 'c-b']); // reranked (reversed) order, first 2
    expect(page.nextCursor).not.toBeNull();
  });

  it('propagates a pool retrieval error', async () => {
    ftsPool.mockResolvedValue({ rows: [], error: 'boom' });
    const svc = makeRagStoreService(supabase, 's', fakeClient());
    await expect(svc.searchBm25('t', 'q', PAGE_LIMIT)).rejects.toThrow('boom');
  });
});

describe('makeRagStoreService semantic', () => {
  it('embeds the query, retrieves the pool, and exhausts with a null cursor', async () => {
    semanticPool.mockResolvedValue({ rows: [chunk('a'), chunk('b')], error: null });
    const svc = makeRagStoreService(supabase, 's', fakeClient());
    const first = await svc.searchSemantic({
      tenantId: 't',
      query: 'q',
      minSimilarity: MIN_SIM,
      limit: SEMANTIC_LIMIT,
    });
    expect(embed).toHaveBeenCalledTimes(ONCE);
    expect(semanticPool).toHaveBeenCalledTimes(ONCE);
    expect(first.items.length).toBe(PAGE_LIMIT);
    expect(first.nextCursor).toBeNull();
  });
});

describe('makeRagStoreService cursor paging', () => {
  it('round-trips the RagPoolCursor: resume returns the next slice with no drop or dup', async () => {
    ftsPool.mockResolvedValue({
      rows: [chunk('a'), chunk('b'), chunk('c'), chunk('d')],
      error: null,
    });
    const svc = makeRagStoreService(supabase, 's', fakeClient());
    // Reranked order is reversed: d, c, b, a.
    const first = await svc.searchBm25('t', 'q', PAGE_LIMIT);
    expect(first.items).toEqual(['c-d', 'c-c']);
    expect(first.nextCursor).not.toBeNull();
    const cursor = first.nextCursor ?? undefined;
    const second = await svc.searchBm25('t', 'q', PAGE_LIMIT, cursor);
    expect(second.items).toEqual(['c-b', 'c-a']); // contiguous, no overlap with page 1
    expect(second.nextCursor).toBeNull(); // pool exhausted
  });
});

describe('makeRagStoreService hybrid + regex', () => {
  it('hybrid merges both pools (deduped), reranks once, and paginates', async () => {
    semanticPool.mockResolvedValue({ rows: [chunk('a'), chunk('b')], error: null });
    ftsPool.mockResolvedValue({ rows: [chunk('b'), chunk('c')], error: null });
    const svc = makeRagStoreService(supabase, 's', fakeClient());
    const page = await svc.searchHybrid({
      tenantId: 't',
      query: 'q',
      minSimilarity: MIN_SIM,
      limit: SEMANTIC_LIMIT,
    });
    expect(embed).toHaveBeenCalledTimes(ONCE);
    expect(rerank).toHaveBeenCalledTimes(ONCE);
    // merged unique = [a, b, c]; reranked (reversed) = [c, b, a].
    expect(page.items).toEqual(['c-c', 'c-b', 'c-a']);
    expect(page.nextCursor).toBeNull();
  });

  it('regex filters the fts pool with re2js before reranking', async () => {
    ftsPool.mockResolvedValue({
      rows: [chunk('foo-1'), chunk('bar-2'), chunk('foo-3')],
      error: null,
    });
    const svc = makeRagStoreService(supabase, 's', fakeClient());
    const page = await svc.searchRegex({ tenantId: 't', pattern: 'c-foo-\\d', limit: SEMANTIC_LIMIT });
    // only c-foo-1 / c-foo-3 match; reranked (reversed) = [c-foo-3, c-foo-1].
    expect(page.items).toEqual(['c-foo-3', 'c-foo-1']);
    expect(rerank).toHaveBeenCalledTimes(ONCE);
  });
});
