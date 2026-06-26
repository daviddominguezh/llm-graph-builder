import type { SupabaseClient } from '@supabase/supabase-js';

import { ilikePrefilterPage, listKeysPage, scanKeysetPage } from '../kv/kvQueries.js';

const PAGE_LIMIT = 10;
const PAGE_SIZE = 500;

interface Call {
  method: string;
  args: unknown[];
}

interface StubRow {
  key: string;
  value: string;
}

function buildChain(calls: Call[], rows: StubRow[]): Record<string, (...a: unknown[]) => unknown> {
  const builder: Record<string, (...a: unknown[]) => unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]): unknown => {
      calls.push({ method, args });
      return builder;
    };
  for (const m of ['from', 'select', 'eq', 'gt', 'or', 'ilike', 'order']) builder[m] = record(m);
  builder.limit = async (...args: unknown[]): Promise<{ data: unknown; error: null }> => {
    calls.push({ method: 'limit', args });
    await Promise.resolve();
    return { data: rows, error: null };
  };
  return builder;
}

function isSupabaseClient(value: unknown): value is SupabaseClient {
  return typeof value === 'object' && value !== null && 'from' in value;
}

// Hand-rolled supabase-client stub: the query layer only ever touches the
// `from -> select -> filter -> order -> limit` chain. The mock is narrowed to
// `SupabaseClient` via a user-defined type guard (the lint-clean idiom used by
// executeFetcher.test.ts) rather than a type assertion, which
// @typescript-eslint/no-unsafe-type-assertion forbids.
function makeStub(rows: StubRow[]): { client: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  const builder = buildChain(calls, rows);
  if (!isSupabaseClient(builder)) throw new Error('stub is not a supabase client');
  return { client: builder, calls };
}

describe('kvQueries keyset paging', () => {
  it('listKeysPage seeks past afterKey and orders ascending', async () => {
    const { client, calls } = makeStub([{ key: 'a', value: 'x' }]);
    const res = await listKeysPage(client, {
      kvStoreId: 's',
      tenantId: 't',
      limit: PAGE_LIMIT,
      afterKey: 'prev',
    });
    expect(res.error).toBeNull();
    expect(res.keys).toEqual(['a']);
    expect(calls).toContainEqual({ method: 'gt', args: ['key', 'prev'] });
    expect(calls).toContainEqual({ method: 'order', args: ['key', { ascending: true }] });
  });

  it('listKeysPage omits the gt seek on the first page', async () => {
    const { client, calls } = makeStub([]);
    await listKeysPage(client, { kvStoreId: 's', tenantId: 't', limit: PAGE_LIMIT, afterKey: null });
    expect(calls.find((c) => c.method === 'gt')).toBeUndefined();
  });
});

describe('kvQueries substring + scan paging', () => {
  it('ilikePrefilterPage escapes LIKE metacharacters in the literal', async () => {
    const { client, calls } = makeStub([]);
    await ilikePrefilterPage(client, {
      kvStoreId: 's',
      tenantId: 't',
      on: 'keys',
      literal: '50%_x',
      afterKey: null,
      pageSize: PAGE_SIZE,
    });
    const ilikeCall = calls.find((c) => c.method === 'ilike');
    expect(ilikeCall?.args).toEqual(['key', '%50\\%\\_x%']);
  });

  it('scanKeysetPage paginates by key only', async () => {
    const { client, calls } = makeStub([{ key: 'b', value: 'y' }]);
    const res = await scanKeysetPage(client, {
      kvStoreId: 's',
      tenantId: 't',
      afterKey: 'a',
      pageSize: PAGE_SIZE,
    });
    expect(res.entries).toEqual([{ key: 'b', value: 'y' }]);
    expect(calls).toContainEqual({ method: 'gt', args: ['key', 'a'] });
  });
});
