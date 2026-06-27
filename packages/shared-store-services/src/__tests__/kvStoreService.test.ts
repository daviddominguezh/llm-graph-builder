import { jest } from '@jest/globals';

import type { SupabaseClient } from '@supabase/supabase-js';

interface KvRow {
  key: string;
  value: string;
}

interface KeysResult {
  keys: string[];
  error: string | null;
}

interface PageResult {
  entries: KvRow[];
  error: string | null;
}

interface UpsertResult {
  error: string | null;
}

const LIST_LIMIT = 3;
const SMALL_LIMIT = 2;
const LIMIT = 5;
const FULL_PAGE = 500;
const SHORT_PAGE = 10;
const KEY_PAD = 4;
const FIRST_CALL = 0;
const LAST_CALL = -1;
const ARGS_INDEX = 1;
const ONCE = 1;
const SCAN_PATTERN = '[0-9]+[a-z]+';

// Typed jest mocks: passing the function signature to `jest.fn<T>()` keeps
// `mockResolvedValue`/`mockImplementation` argument types precise (an untyped
// `jest.fn()` infers a return of `unknown`, which collapses those params to
// `never`). The arg shapes also let assertions read `.mock.calls` without any
// type assertions.
const listKeysPage =
  jest.fn<(supabase: unknown, args: { afterKey: string | null }) => Promise<KeysResult>>();
const getByKeys =
  jest.fn<
    (s: unknown, store: string, tenant: string, keys: string[]) => Promise<Record<string, string | null>>
  >();
const ilikePrefilterPage =
  jest.fn<(s: unknown, args: { afterKey: string | null; literal: string }) => Promise<PageResult>>();
const scanKeysetPage =
  jest.fn<(s: unknown, args: { afterKey: string | null }) => Promise<PageResult>>();
const upsertValue =
  jest.fn<(s: unknown, args: { key: string; value: string }) => Promise<UpsertResult>>();

jest.unstable_mockModule('../kv/kvQueries.js', () => ({
  listKeysPage,
  getByKeys,
  ilikePrefilterPage,
  scanKeysetPage,
  upsertValue,
}));

// Mock the runner barrel so the factory's `ToolError` value-import does not pull
// in the (alias-using) api dist at runtime; only the class behaviour matters.
class ToolErrorStub extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ToolError';
  }
}

jest.unstable_mockModule('@daviddh/llm-graph-runner', () => ({ ToolError: ToolErrorStub }));

const { makeKvStoreService } = await import('../kv/kvStoreService.js');

const sampleRows = (n: number, prefix: string): KvRow[] =>
  Array.from({ length: n }, (_, i) => ({ key: `${prefix}${String(i).padStart(KEY_PAD, '0')}`, value: 'v' }));

// The query layer is fully mocked, so the client is never touched — but the
// factory wants a real `SupabaseClient`. Narrow a minimal stub via a type guard
// (the lint-clean idiom from kvQueries.test.ts) rather than a type assertion.
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

const supabase = fakeSupabase();

beforeEach(() => {
  listKeysPage.mockReset();
  ilikePrefilterPage.mockReset();
  scanKeysetPage.mockReset();
  getByKeys.mockReset();
  upsertValue.mockReset();
});

describe('makeKvStoreService.listKeys', () => {
  it('returns nextCursor != null when a full page comes back', async () => {
    listKeysPage.mockResolvedValue({ keys: ['a', 'b', 'c'], error: null });
    const page = await makeKvStoreService(supabase, 'store1').listKeys('t', LIST_LIMIT);
    expect(page.items).toEqual(['a', 'b', 'c']);
    expect(page.nextCursor).not.toBeNull();
  });

  it('returns nextCursor = null when fewer than limit returned', async () => {
    listKeysPage.mockResolvedValue({ keys: ['a'], error: null });
    const page = await makeKvStoreService(supabase, 'store1').listKeys('t', LIST_LIMIT);
    expect(page.nextCursor).toBeNull();
  });

  it('nextCursor round-trips: the next page resumes after the last key', async () => {
    listKeysPage.mockResolvedValueOnce({ keys: ['a', 'b', 'c'], error: null });
    const svc = makeKvStoreService(supabase, 'store1');
    const first = await svc.listKeys('t', LIST_LIMIT);
    expect(first.nextCursor).not.toBeNull();

    listKeysPage.mockResolvedValueOnce({ keys: ['d'], error: null });
    const second = await svc.listKeys('t', LIST_LIMIT, first.nextCursor ?? undefined);
    expect(second.items).toEqual(['d']);
    expect(listKeysPage.mock.calls.at(LAST_CALL)?.[ARGS_INDEX].afterKey).toBe('c');
  });
});

describe('makeKvStoreService.searchSubstring', () => {
  it('nextCursor = last key on a full page, then resumes after it', async () => {
    ilikePrefilterPage.mockResolvedValueOnce({
      entries: [
        { key: 'k1', value: 'aa' },
        { key: 'k2', value: 'ab' },
      ],
      error: null,
    });
    const svc = makeKvStoreService(supabase, 'store1');
    const page = await svc.searchSubstring({ tenantId: 't', on: 'both', query: 'a', limit: SMALL_LIMIT });
    expect(page.nextCursor).not.toBeNull();

    ilikePrefilterPage.mockResolvedValueOnce({ entries: [{ key: 'k3', value: 'az' }], error: null });
    const next = await svc.searchSubstring({
      tenantId: 't',
      on: 'both',
      query: 'a',
      limit: SMALL_LIMIT,
      cursor: page.nextCursor ?? undefined,
    });
    expect(next.items).toEqual([{ key: 'k3', value: 'az' }]);
    expect(next.nextCursor).toBeNull();
    const passed = ilikePrefilterPage.mock.calls.at(LAST_CALL)?.[ARGS_INDEX];
    expect(passed?.afterKey).toBe('k2');
    expect(passed?.literal).toBe('a');
  });
});

describe('makeKvStoreService.searchRegex with extractable literal', () => {
  it('accumulates matches across ILIKE batches and never scans', async () => {
    ilikePrefilterPage
      .mockResolvedValueOnce({ entries: [{ key: 'k0001', value: 'foobar' }], error: null })
      .mockResolvedValueOnce({ entries: [], error: null });
    const svc = makeKvStoreService(supabase, 'store1');
    const page = await svc.searchRegex({ tenantId: 't', on: 'values', pattern: 'foobar', limit: LIMIT });
    expect(page.items).toEqual([{ key: 'k0001', value: 'foobar' }]);
    expect(page.nextCursor).toBeNull();
    expect(scanKeysetPage).not.toHaveBeenCalled();
  });

  it('filters out prefilter rows the compiled regex does not match', async () => {
    ilikePrefilterPage
      .mockResolvedValueOnce({
        entries: [
          { key: 'k1', value: 'foobar' },
          { key: 'k2', value: 'foobaz' },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ entries: [], error: null });
    const svc = makeKvStoreService(supabase, 'store1');
    const page = await svc.searchRegex({ tenantId: 't', on: 'values', pattern: 'foobar', limit: LIMIT });
    expect(page.items).toEqual([{ key: 'k1', value: 'foobar' }]);
    expect(ilikePrefilterPage.mock.calls[FIRST_CALL]?.[ARGS_INDEX].literal).toBe('foobar');
  });
});

describe('makeKvStoreService.searchRegex bounded scan (no literal)', () => {
  it('stops at the row budget with a forward-progress cursor', async () => {
    scanKeysetPage.mockImplementation(async () => {
      await Promise.resolve();
      return { entries: sampleRows(FULL_PAGE, 'z'), error: null };
    });
    const svc = makeKvStoreService(supabase, 'store1');
    const page = await svc.searchRegex({ tenantId: 't', on: 'keys', pattern: SCAN_PATTERN, limit: LIMIT });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).not.toBeNull();
    expect(ilikePrefilterPage).not.toHaveBeenCalled();
  });

  it('scan cursor round-trips: resumes after the last scanned key', async () => {
    scanKeysetPage.mockImplementation(async () => {
      await Promise.resolve();
      return { entries: sampleRows(FULL_PAGE, 'z'), error: null };
    });
    const svc = makeKvStoreService(supabase, 'store1');
    const page = await svc.searchRegex({ tenantId: 't', on: 'keys', pattern: SCAN_PATTERN, limit: LIMIT });
    expect(page.nextCursor).not.toBeNull();

    scanKeysetPage.mockReset();
    scanKeysetPage.mockResolvedValueOnce({ entries: [], error: null });
    const next = await svc.searchRegex({
      tenantId: 't',
      on: 'keys',
      pattern: SCAN_PATTERN,
      limit: LIMIT,
      cursor: page.nextCursor ?? undefined,
    });
    expect(next.nextCursor).toBeNull();
    expect(scanKeysetPage.mock.calls[FIRST_CALL]?.[ARGS_INDEX].afterKey).toBe('z0499');
  });

  it('exhaustion (short page) yields nextCursor = null', async () => {
    scanKeysetPage.mockResolvedValueOnce({ entries: sampleRows(SHORT_PAGE, 'z'), error: null });
    const svc = makeKvStoreService(supabase, 'store1');
    const page = await svc.searchRegex({ tenantId: 't', on: 'keys', pattern: SCAN_PATTERN, limit: LIMIT });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe('makeKvStoreService.searchRegex final short page exceeding limit', () => {
  // Keys shaped `<digit>a` match SCAN_PATTERN; single digits keep the lexical
  // ordering the keyset scan relies on. A short page (< KV_SCAN_PAGE_SIZE) of
  // all-matching rows that outnumber the limit reproduces the dropped-tail bug.
  const allMatch = sampleRows(SHORT_PAGE, '').map((r, i) => ({ key: `${String(i)}a`, value: r.value }));
  const head = allMatch.slice(FIRST_CALL, LIMIT);
  const tail = allMatch.slice(LIMIT);

  it('keeps paging when a short final page holds more matches than the limit', async () => {
    scanKeysetPage.mockResolvedValueOnce({ entries: allMatch, error: null });
    const svc = makeKvStoreService(supabase, 'store1');
    const page = await svc.searchRegex({ tenantId: 't', on: 'keys', pattern: SCAN_PATTERN, limit: LIMIT });
    expect(page.items).toEqual(head);
    expect(page.nextCursor).not.toBeNull();

    scanKeysetPage.mockResolvedValueOnce({ entries: tail, error: null });
    const next = await svc.searchRegex({
      tenantId: 't',
      on: 'keys',
      pattern: SCAN_PATTERN,
      limit: LIMIT,
      cursor: page.nextCursor ?? undefined,
    });
    expect(next.items).toEqual(tail);
    expect(next.nextCursor).toBeNull();
    expect(scanKeysetPage.mock.calls.at(LAST_CALL)?.[ARGS_INDEX].afterKey).toBe(head.at(LAST_CALL)?.key);
  });
});

describe('makeKvStoreService.getValues + updateValue', () => {
  it('getValues delegates to getByKeys', async () => {
    getByKeys.mockResolvedValue({ a: '1', b: null });
    const res = await makeKvStoreService(supabase, 'store1').getValues('t', ['a', 'b']);
    expect(res).toEqual({ a: '1', b: null });
  });

  it('updateValue rejects protected keys without touching upsert', async () => {
    const svc = makeKvStoreService(supabase, 'store1');
    await expect(svc.updateValue('t', '_sys.flag', 'v')).rejects.toMatchObject({ code: 'protected_key' });
    expect(upsertValue).not.toHaveBeenCalled();
  });

  it('updateValue upserts a writable key', async () => {
    upsertValue.mockResolvedValue({ error: null });
    const res = await makeKvStoreService(supabase, 'store1').updateValue('t', 'ok', 'v');
    expect(res).toEqual({ success: true });
    expect(upsertValue).toHaveBeenCalledTimes(ONCE);
  });
});
