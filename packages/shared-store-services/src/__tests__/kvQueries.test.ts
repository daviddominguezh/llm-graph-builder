import type { SupabaseClient } from '@supabase/supabase-js';

import { ilikePrefilterPage, listKeysPage, scanKeysetPage } from '../kv/kvQueries.js';

const PAGE_LIMIT = 10;
const PAGE_SIZE = 500;
const FIRST_ARG = 0;

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

// Reads a recorded filter argument as a string without a type assertion
// (@typescript-eslint/no-unsafe-type-assertion forbids `as string`).
function asFilterString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('expected a filter string');
  return value;
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

describe('kvQueries ILIKE literal escaping', () => {
  it('escapes LIKE metacharacters in the literal', async () => {
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

  it('escapes embedded quotes/backslashes in the or() value', async () => {
    const { client, calls } = makeStub([]);
    await ilikePrefilterPage(client, {
      kvStoreId: 's',
      tenantId: 't',
      on: 'both',
      literal: 'a"b\\c',
      afterKey: null,
      pageSize: PAGE_SIZE,
    });
    const orCall = calls.find((c) => c.method === 'or');
    const filter = asFilterString(orCall?.args[FIRST_ARG]);
    // Embedded " and \ are backslash-escaped so they cannot terminate the quote.
    expect(filter).toContain('a\\"b');
  });
});

describe('kvQueries PostgREST injection safety', () => {
  it('neutralizes injection in the or() filter (on=both)', async () => {
    const { client, calls } = makeStub([]);
    // An LLM-controlled literal containing PostgREST structural chars (comma,
    // dot, parens) must NOT be able to add or alter filter clauses. It should be
    // carried as a single quoted ILIKE value matched literally.
    const malicious = 'x,value.ilike.*),(secret';
    await ilikePrefilterPage(client, {
      kvStoreId: 's',
      tenantId: 't',
      on: 'both',
      literal: malicious,
      afterKey: null,
      pageSize: PAGE_SIZE,
    });
    const orCall = calls.find((c) => c.method === 'or');
    expect(orCall).toBeDefined();
    const filter = asFilterString(orCall?.args[FIRST_ARG]);
    // Exactly two top-level clauses (key + value); each value is double-quoted,
    // so the only structural comma is the one BETWEEN the two quoted clauses.
    // Splitting on the closing-quote boundary proves the malicious comma did
    // not create a third clause.
    expect(filter).toMatch(/^key\.ilike\."[^]*",value\.ilike\."[^]*"$/v);
    const [keyClause, valueClause] = filter.split('",value.ilike."');
    expect(keyClause).toBe(`key.ilike."%${malicious}%`);
    expect(valueClause).toBe(`%${malicious}%"`);
  });
});
