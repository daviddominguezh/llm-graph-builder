import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  PaginatedSearchResult,
  RegexSearchParams,
  SearchParams,
  SemanticSearchParams,
} from '../rag/search/types.js';

const STORE_ID = 'rag-1';
const TENANT_ID = 't1';
const ZERO = 0;
const FIVE = 5;
const ONE = 1;
const OFFSET = ZERO;
const LIMIT = FIVE;
const MIN_SIM = 0.7;

type SimpleFn = (client: SupabaseClient, params: SearchParams) => Promise<PaginatedSearchResult>;
type SemanticFn = (client: SupabaseClient, params: SemanticSearchParams) => Promise<PaginatedSearchResult>;
type RegexFn = (client: SupabaseClient, params: RegexSearchParams) => Promise<PaginatedSearchResult>;

const mockSimple = jest.fn<SimpleFn>();
const mockSemantic = jest.fn<SemanticFn>();
const mockHybrid = jest.fn<SemanticFn>();
const mockRegex = jest.fn<RegexFn>();

jest.unstable_mockModule('../rag/search/simple.js', () => ({ runSimpleSearch: mockSimple }));
jest.unstable_mockModule('../rag/search/semantic.js', () => ({ runSemanticSearch: mockSemantic }));
jest.unstable_mockModule('../rag/search/hybrid.js', () => ({ runHybridSearch: mockHybrid }));
jest.unstable_mockModule('../rag/search/regex.js', () => ({ runRegexSearch: mockRegex }));

const { makeRagStoreService } = await import('./ragStoreService.js');

const mockCreateSupabase = jest.fn<() => SupabaseClient>();
const supabase = mockCreateSupabase();
const svc = makeRagStoreService(supabase, STORE_ID);

const stubResult: PaginatedSearchResult = { items: ['a'], total: ONE, offset: OFFSET, limit: LIMIT };

beforeEach(() => {
  mockSimple.mockReset();
  mockSemantic.mockReset();
  mockHybrid.mockReset();
  mockRegex.mockReset();
  mockSimple.mockResolvedValue(stubResult);
  mockSemantic.mockResolvedValue(stubResult);
  mockHybrid.mockResolvedValue(stubResult);
  mockRegex.mockResolvedValue(stubResult);
});

describe('makeRagStoreService — bm25', () => {
  it('calls runSimpleSearch with storeId', async () => {
    await svc.searchBm25(TENANT_ID, 'hello', OFFSET, LIMIT);
    expect(mockSimple).toHaveBeenCalledWith(supabase, {
      storeId: STORE_ID,
      tenantId: TENANT_ID,
      query: 'hello',
      offset: OFFSET,
      limit: LIMIT,
    });
  });
});

describe('makeRagStoreService — semantic', () => {
  it('calls runSemanticSearch with storeId + minSimilarity', async () => {
    await svc.searchSemantic({
      tenantId: TENANT_ID,
      query: 'hi',
      minSimilarity: MIN_SIM,
      offset: OFFSET,
      limit: LIMIT,
    });
    expect(mockSemantic).toHaveBeenCalledWith(supabase, {
      storeId: STORE_ID,
      tenantId: TENANT_ID,
      query: 'hi',
      minSimilarity: MIN_SIM,
      offset: OFFSET,
      limit: LIMIT,
    });
  });
});

describe('makeRagStoreService — hybrid', () => {
  it('calls runHybridSearch with storeId + minSimilarity', async () => {
    await svc.searchHybrid({
      tenantId: TENANT_ID,
      query: 'hi',
      minSimilarity: MIN_SIM,
      offset: OFFSET,
      limit: LIMIT,
    });
    expect(mockHybrid).toHaveBeenCalledWith(supabase, {
      storeId: STORE_ID,
      tenantId: TENANT_ID,
      query: 'hi',
      minSimilarity: MIN_SIM,
      offset: OFFSET,
      limit: LIMIT,
    });
  });
});

describe('makeRagStoreService — regex + storeId', () => {
  it('searchRegex calls runRegexSearch with storeId + pattern', async () => {
    await svc.searchRegex({
      tenantId: TENANT_ID,
      pattern: 'foo.*bar',
      offset: OFFSET,
      limit: LIMIT,
    });
    expect(mockRegex).toHaveBeenCalledWith(supabase, {
      storeId: STORE_ID,
      tenantId: TENANT_ID,
      pattern: 'foo.*bar',
      offset: OFFSET,
      limit: LIMIT,
    });
  });

  it('exposes storeId', () => {
    expect(svc.storeId).toBe(STORE_ID);
  });
});
