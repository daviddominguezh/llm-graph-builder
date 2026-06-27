import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import { makeRagStoreService } from './ragStoreService.js';

const STORE_ID = 'rag-1';

const mockCreateSupabase = jest.fn<() => SupabaseClient>();
const supabase = mockCreateSupabase();

describe('backend ragStoreService shim', () => {
  it('binds an internal client and returns a RagStoreServices', () => {
    const svc = makeRagStoreService(supabase, STORE_ID);
    expect(svc.storeId).toBe(STORE_ID);
    expect(typeof svc.searchBm25).toBe('function');
    expect(typeof svc.searchSemantic).toBe('function');
    expect(typeof svc.searchHybrid).toBe('function');
    expect(typeof svc.searchRegex).toBe('function');
  });
});
