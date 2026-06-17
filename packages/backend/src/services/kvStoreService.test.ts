import { ToolError } from '@daviddh/llm-graph-runner';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

const STORE_ID = 'kv-1';
const TENANT_ID = 't1';
const OFFSET = 0;
const LIMIT = 10;
const ZERO = 0;
const ONE = 1;
const TWO = 2;
const REGEX_ROW_CAP = 10_000;
const PATTERN_LIMIT_EXCEED = 1100;
const KEY_OVER_LIMIT_BYTES = 300;
const VALUE_OVER_LIMIT_BYTES = 300_000;

type ListKeysFn = (
  supabase: SupabaseClient,
  args: { kvStoreId: string; tenantId: string; offset: number; limit: number }
) => Promise<{ keys: string[]; total: number; error: string | null }>;

type GetByKeysFn = (
  supabase: SupabaseClient,
  kvStoreId: string,
  tenantId: string,
  keys: string[]
) => Promise<Record<string, string | null>>;

type SearchIlikeFn = (
  supabase: SupabaseClient,
  args: {
    kvStoreId: string;
    tenantId: string;
    on: 'keys' | 'values' | 'both';
    query: string;
    offset: number;
    limit: number;
  }
) => Promise<{ entries: Array<{ key: string; value: string }>; total: number; error: string | null }>;

type GetEntriesForRegexFn = (
  supabase: SupabaseClient,
  kvStoreId: string,
  tenantId: string,
  maxRows: number
) => Promise<{
  entries: Array<{ key: string; value: string }>;
  truncated: boolean;
  error: string | null;
}>;

type UpdateValueFn = (
  supabase: SupabaseClient,
  args: { kvStoreId: string; tenantId: string; key: string; value: string }
) => Promise<{ error: string | null }>;

const mockListKeys = jest.fn<ListKeysFn>();
const mockGetByKeys = jest.fn<GetByKeysFn>();
const mockSearchIlike = jest.fn<SearchIlikeFn>();
const mockGetEntriesForRegex = jest.fn<GetEntriesForRegexFn>();
const mockUpdateValue = jest.fn<UpdateValueFn>();

jest.unstable_mockModule('../db/queries/kvEntriesQueries.js', () => ({
  listKeys: mockListKeys,
  getByKeys: mockGetByKeys,
  searchEntriesIlike: mockSearchIlike,
  getEntriesForRegex: mockGetEntriesForRegex,
  updateValueQuery: mockUpdateValue,
}));

const { makeKvStoreService } = await import('./kvStoreService.js');

const mockCreateSupabase = jest.fn<() => SupabaseClient>();
const supabase = mockCreateSupabase();
const svc = makeKvStoreService(supabase, STORE_ID);

beforeEach(() => {
  mockListKeys.mockReset();
  mockGetByKeys.mockReset();
  mockSearchIlike.mockReset();
  mockGetEntriesForRegex.mockReset();
  mockUpdateValue.mockReset();
});

describe('makeKvStoreService — listKeys / getValues', () => {
  it('listKeys forwards pagination', async () => {
    mockListKeys.mockResolvedValue({ keys: ['a', 'b'], total: TWO, error: null });
    const res = await svc.listKeys(TENANT_ID, OFFSET, LIMIT);
    expect(res.items).toEqual(['a', 'b']);
    expect(res.total).toBe(TWO);
    expect(mockListKeys).toHaveBeenCalledWith(supabase, {
      kvStoreId: STORE_ID,
      tenantId: TENANT_ID,
      offset: OFFSET,
      limit: LIMIT,
    });
  });

  it('getValues returns the dictionary from the query', async () => {
    const dict: Record<string, string | null> = { a: 'x', b: null };
    mockGetByKeys.mockResolvedValue(dict);
    const res = await svc.getValues(TENANT_ID, ['a', 'b']);
    expect(res).toEqual(dict);
  });
});

describe('makeKvStoreService — searchSubstring', () => {
  it('calls searchEntriesIlike (no in-memory fetch)', async () => {
    mockSearchIlike.mockResolvedValue({
      entries: [{ key: 'a', value: 'aa' }],
      total: ONE,
      error: null,
    });
    const res = await svc.searchSubstring({
      tenantId: TENANT_ID,
      on: 'both',
      query: 'a',
      offset: OFFSET,
      limit: LIMIT,
    });
    expect(res.items).toEqual([{ key: 'a', value: 'aa' }]);
    expect(mockGetEntriesForRegex).not.toHaveBeenCalled();
  });
});

describe('makeKvStoreService — searchRegex', () => {
  it('returns truncated: true when DB hits the row cap', async () => {
    const entries: Array<{ key: string; value: string }> = [];
    for (let i = ZERO; i < REGEX_ROW_CAP; i += ONE) entries.push({ key: `k${String(i)}`, value: 'foo' });
    mockGetEntriesForRegex.mockResolvedValue({ entries, truncated: true, error: null });
    const res = await svc.searchRegex({
      tenantId: TENANT_ID,
      on: 'values',
      pattern: 'foo',
      offset: OFFSET,
      limit: LIMIT,
    });
    expect(res.truncated).toBe(true);
  });

  it('rejects patterns above the length cap', async () => {
    const longPattern = 'a'.repeat(PATTERN_LIMIT_EXCEED);
    await expect(
      svc.searchRegex({
        tenantId: TENANT_ID,
        on: 'both',
        pattern: longPattern,
        offset: OFFSET,
        limit: LIMIT,
      })
    ).rejects.toMatchObject({ name: 'ToolError', code: 'invalid_pattern' });
  });
});

describe('makeKvStoreService — updateValue', () => {
  it('rejects keys starting with _sys. (lowercase)', async () => {
    await expect(svc.updateValue(TENANT_ID, '_sys.foo', 'bar')).rejects.toBeInstanceOf(ToolError);
  });

  it('rejects keys starting with _SYS. (uppercase)', async () => {
    await expect(svc.updateValue(TENANT_ID, '_SYS.FOO', 'bar')).rejects.toMatchObject({
      name: 'ToolError',
      code: 'protected_key',
    });
  });

  it('rejects oversized keys', async () => {
    const bigKey = 'k'.repeat(KEY_OVER_LIMIT_BYTES);
    await expect(svc.updateValue(TENANT_ID, bigKey, 'v')).rejects.toMatchObject({
      name: 'ToolError',
      code: 'key_too_long',
    });
  });

  it('rejects oversized values', async () => {
    const bigValue = 'v'.repeat(VALUE_OVER_LIMIT_BYTES);
    await expect(svc.updateValue(TENANT_ID, 'k', bigValue)).rejects.toMatchObject({
      name: 'ToolError',
      code: 'value_too_large',
    });
  });

  it('calls updateValueQuery on success', async () => {
    mockUpdateValue.mockResolvedValue({ error: null });
    const res = await svc.updateValue(TENANT_ID, 'k', 'v');
    expect(res).toEqual({ success: true });
    expect(mockUpdateValue).toHaveBeenCalledWith(supabase, {
      kvStoreId: STORE_ID,
      tenantId: TENANT_ID,
      key: 'k',
      value: 'v',
    });
  });
});
