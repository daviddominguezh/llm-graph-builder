import type { RagStoreServices } from '@daviddh/llm-graph-runner';
import type { InternalApiClient, InternalApiConfig } from '@daviddh/shared-store-services';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

const STORE_ID = 'rag-1';
const DEFAULT_BASE_URL = 'http://127.0.0.1:4000';
const EMPTY_LIMIT = 0;

async function emptyArray<T>(): Promise<T[]> {
  await Promise.resolve();
  return [];
}

async function emptyPage(): Promise<{ items: string[]; limit: number; nextCursor: string | null }> {
  await Promise.resolve();
  return { items: [], limit: EMPTY_LIMIT, nextCursor: null };
}

const fakeInternalClient: InternalApiClient = {
  embed: emptyArray,
  rerank: emptyArray,
};

const fakeRagService: RagStoreServices = {
  storeId: STORE_ID,
  searchBm25: emptyPage,
  searchSemantic: emptyPage,
  searchHybrid: emptyPage,
  searchRegex: emptyPage,
};

let capturedConfig: InternalApiConfig | undefined = undefined;

const makeInternalApiClient = jest.fn<(cfg: InternalApiConfig) => InternalApiClient>((cfg) => {
  capturedConfig = cfg;
  return fakeInternalClient;
});
const makeSharedRagStoreService = jest.fn<() => RagStoreServices>(() => fakeRagService);

jest.unstable_mockModule('@daviddh/shared-store-services', () => ({
  makeInternalApiClient,
  makeRagStoreService: makeSharedRagStoreService,
}));

const { makeRagStoreService } = await import('./ragStoreService.js');

const mockCreateSupabase = jest.fn<() => SupabaseClient>();
const supabase = mockCreateSupabase();

function readBackendUrlEnv(): string | undefined {
  return process.env.BACKEND_INTERNAL_URL;
}

const originalBackendUrl = readBackendUrlEnv();

describe('backend ragStoreService shim', () => {
  beforeEach(() => {
    capturedConfig = undefined;
    makeInternalApiClient.mockClear();
    makeSharedRagStoreService.mockClear();
  });

  afterEach(() => {
    if (originalBackendUrl === undefined) delete process.env.BACKEND_INTERNAL_URL;
    else process.env.BACKEND_INTERNAL_URL = originalBackendUrl;
  });

  it('binds an internal client and returns a RagStoreServices', () => {
    const svc = makeRagStoreService(supabase, STORE_ID);
    expect(svc.storeId).toBe(STORE_ID);
    expect(typeof svc.searchBm25).toBe('function');
    expect(typeof svc.searchSemantic).toBe('function');
    expect(typeof svc.searchHybrid).toBe('function');
    expect(typeof svc.searchRegex).toBe('function');
  });

  it('defaults the internal-api baseUrl to :4000 when BACKEND_INTERNAL_URL is absent', () => {
    delete process.env.BACKEND_INTERNAL_URL;
    makeRagStoreService(supabase, STORE_ID);
    expect(capturedConfig?.baseUrl).toBe(DEFAULT_BASE_URL);
  });
});
