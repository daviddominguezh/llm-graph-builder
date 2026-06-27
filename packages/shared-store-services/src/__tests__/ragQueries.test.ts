import type { SupabaseClient } from '@supabase/supabase-js';

import { ftsPool, semanticPool } from '../rag/ragQueries.js';

const POOL_K = 50;
const VEC_A = 0.1;
const VEC_B = 0.2;
const VEC_C = 0.3;
const VEC_SINGLE = 1;
const MAX_DISTANCE = 0.4;

interface Call {
  fn: string;
  args: unknown;
}

// Hand-rolled supabase-client stub: the RAG query layer only touches `.rpc()`.
// The mock is narrowed to `SupabaseClient` via a user-defined type guard (the
// lint-clean idiom used by kvQueries.test.ts) rather than a type assertion,
// which @typescript-eslint/no-unsafe-type-assertion forbids.
function isSupabaseClient(value: unknown): value is SupabaseClient {
  return typeof value === 'object' && value !== null && 'rpc' in value;
}

function makeStub(rows: unknown[]): { client: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {
    rpc: async (fn: string, args: unknown): Promise<{ data: unknown; error: null }> => {
      calls.push({ fn, args });
      await Promise.resolve();
      return { data: rows, error: null };
    },
  };
  if (!isSupabaseClient(builder)) throw new Error('stub is not a supabase client');
  return { client: builder, calls };
}

describe('ragQueries ftsPool', () => {
  it('calls rag_text_search with the store/tenant/query/k args', async () => {
    const { client, calls } = makeStub([{ id: '1', content: 'hello' }]);
    const res = await ftsPool(client, { storeId: 's', tenantId: 't', query: 'q', k: POOL_K });
    expect(res.error).toBeNull();
    expect(res.rows).toEqual([{ id: '1', content: 'hello' }]);
    expect(calls).toEqual([
      {
        fn: 'rag_text_search',
        args: { p_rag_store_id: 's', p_tenant_id: 't', p_query: 'q', p_k: POOL_K },
      },
    ]);
  });

  it('drops malformed rows that are not RagChunks', async () => {
    const { client } = makeStub([{ id: '1', content: 'ok' }, { id: '2' }]);
    const res = await ftsPool(client, { storeId: 's', tenantId: 't', query: 'q', k: POOL_K });
    expect(res.rows).toEqual([{ id: '1', content: 'ok' }]);
  });
});

describe('ragQueries semanticPool', () => {
  it('calls rag_semantic_search with the vector serialized as [a,b,...]', async () => {
    const { client, calls } = makeStub([{ id: '7', content: 'vec' }]);
    const res = await semanticPool(client, {
      storeId: 's',
      tenantId: 't',
      queryVector: [VEC_A, VEC_B, VEC_C],
      k: POOL_K,
      maxDistance: MAX_DISTANCE,
    });
    expect(res.error).toBeNull();
    expect(res.rows).toEqual([{ id: '7', content: 'vec' }]);
    expect(calls).toEqual([
      {
        fn: 'rag_semantic_search',
        args: {
          p_rag_store_id: 's',
          p_tenant_id: 't',
          p_query_vector: '[0.1,0.2,0.3]',
          p_k: POOL_K,
          p_max_distance: MAX_DISTANCE,
        },
      },
    ]);
  });

  it('passes a null maxDistance through unchanged', async () => {
    const { client, calls } = makeStub([]);
    await semanticPool(client, {
      storeId: 's',
      tenantId: 't',
      queryVector: [VEC_SINGLE],
      k: POOL_K,
      maxDistance: null,
    });
    const [first] = calls;
    expect(first).toBeDefined();
    expect(first?.args).toMatchObject({ p_max_distance: null });
  });
});
