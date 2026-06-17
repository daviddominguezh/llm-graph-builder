import { describe, expect, it, jest } from '@jest/globals';

interface QueryResult<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

type AnyResult = QueryResult<unknown>;

interface ChainMock {
  select: () => ChainMock;
  eq: () => ChainMock;
  update: () => ChainMock;
  maybeSingle: () => Promise<AnyResult>;
  then: <T>(resolve: (value: AnyResult) => T) => Promise<T>;
}

let nextResultsByTable: Record<string, AnyResult[]> = {};

function resetMocks(): void {
  nextResultsByTable = {};
}

const EMPTY_QUEUE = 0;
const EMPTY_RESULT: AnyResult = { data: null, error: null };

function queueResult(table: string, result: AnyResult): void {
  const { [table]: existing = [] } = nextResultsByTable;
  existing.push(result);
  nextResultsByTable[table] = existing;
}

function takeResult(table: string): AnyResult {
  const { [table]: queue } = nextResultsByTable;
  if (queue === undefined || queue.length === EMPTY_QUEUE) return EMPTY_RESULT;
  const next = queue.shift();
  return next ?? EMPTY_RESULT;
}

function makeChain(table: string): ChainMock {
  const chain: ChainMock = {
    select: () => chain,
    eq: () => chain,
    update: () => chain,
    maybeSingle: async () => await Promise.resolve(takeResult(table)),
    then: async <T>(resolve: (value: AnyResult) => T): Promise<T> =>
      await Promise.resolve(resolve(takeResult(table))),
  };
  return chain;
}

const mockFrom = jest.fn<(table: string) => ChainMock>((table: string) => makeChain(table));

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({ from: mockFrom }),
}));

const { createClient } = await import('@supabase/supabase-js');
const {
  getAgentStoreBindings,
  updateAgentStoreBindingsWithPrecondition,
  findAgentsByKvStore,
  findAgentsByRagStore,
} = await import('../agentStoreBindingsQueries.js');

function makeClient(): ReturnType<typeof createClient> {
  return createClient('https://fake.supabase.co', 'fake-key');
}

describe('getAgentStoreBindings', () => {
  it('returns bindings when agent exists', async () => {
    resetMocks();
    queueResult('agents', {
      data: {
        selected_kv_store_id: 'kv-1',
        selected_rag_store_id: 'rag-1',
        updated_at: '2026-06-17T10:00:00.000Z',
      },
      error: null,
    });
    const sb = makeClient();
    const result = await getAgentStoreBindings(sb, 'agent-1');
    expect(result.error).toBeNull();
    expect(result.result).toEqual({
      selectedKvStoreId: 'kv-1',
      selectedRagStoreId: 'rag-1',
      updatedAt: '2026-06-17T10:00:00.000Z',
    });
  });

  it('returns null when agent not found', async () => {
    resetMocks();
    queueResult('agents', { data: null, error: null });
    const sb = makeClient();
    const result = await getAgentStoreBindings(sb, 'missing');
    expect(result.error).toBeNull();
    expect(result.result).toBeNull();
  });
});

describe('updateAgentStoreBindingsWithPrecondition', () => {
  it('returns updated bindings with bumped updated_at on success', async () => {
    resetMocks();
    queueResult('agents', {
      data: {
        selected_kv_store_id: 'kv-2',
        selected_rag_store_id: null,
        updated_at: '2026-06-17T11:00:00.000Z',
      },
      error: null,
    });
    const sb = makeClient();
    const result = await updateAgentStoreBindingsWithPrecondition(sb, 'agent-1', '2026-06-17T10:00:00.000Z', {
      selectedKvStoreId: 'kv-2',
      selectedRagStoreId: null,
    });
    expect(result.conflict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.result?.selectedKvStoreId).toBe('kv-2');
    expect(result.result?.updatedAt).toBe('2026-06-17T11:00:00.000Z');
  });

  it('returns conflict when no row matches precondition', async () => {
    resetMocks();
    queueResult('agents', { data: null, error: null });
    const sb = makeClient();
    const result = await updateAgentStoreBindingsWithPrecondition(sb, 'agent-1', '2026-06-17T10:00:00.000Z', {
      selectedKvStoreId: 'kv-2',
      selectedRagStoreId: null,
    });
    expect(result.conflict).toBe(true);
    expect(result.result).toBeNull();
  });
});

const CURRENT_VERSION = 3;
const STALE_VERSION = 2;
const FIRST_VERSION = 1;
const SINGLE_RESULT_LENGTH = 1;

const DRAFT_AGENT = { id: 'a-1', slug: 'draft-agent', name: 'Draft Agent' };
const PUB_AGENT_REF = { id: 'a-2', slug: 'pub-agent', name: 'Pub Agent' };

function publishedJoinRow(version: number, currentVersion: number): unknown {
  return {
    version,
    agents: { ...PUB_AGENT_REF, current_version: currentVersion, org_id: 'org-1' },
  };
}

function setupDraftOnly(): void {
  resetMocks();
  queueResult('agents', { data: [DRAFT_AGENT], error: null });
  queueResult('agent_versions', { data: [], error: null });
}

function setupPublishedWithStale(): void {
  resetMocks();
  queueResult('agents', { data: [], error: null });
  queueResult('agent_versions', {
    data: [
      publishedJoinRow(CURRENT_VERSION, CURRENT_VERSION),
      publishedJoinRow(STALE_VERSION, CURRENT_VERSION),
    ],
    error: null,
  });
}

function setupBothMatch(): void {
  resetMocks();
  queueResult('agents', {
    data: [{ id: 'a-1', slug: 's1', name: 'n1' }],
    error: null,
  });
  queueResult('agent_versions', {
    data: [publishedJoinRow(FIRST_VERSION, FIRST_VERSION)],
    error: null,
  });
}

describe('findAgentsByKvStore', () => {
  it('returns draft-only match when no published version uses the store', async () => {
    setupDraftOnly();
    const result = await findAgentsByKvStore(makeClient(), 'org-1', 'kv-1');
    expect(result.error).toBeNull();
    expect(result.draft).toEqual([DRAFT_AGENT]);
    expect(result.published).toEqual([]);
  });

  it('returns published agent only when av.version === current_version', async () => {
    setupPublishedWithStale();
    const result = await findAgentsByKvStore(makeClient(), 'org-1', 'kv-1');
    expect(result.error).toBeNull();
    expect(result.draft).toEqual([]);
    expect(result.published).toEqual([PUB_AGENT_REF]);
  });

  it('returns both when draft and published match', async () => {
    setupBothMatch();
    const result = await findAgentsByKvStore(makeClient(), 'org-1', 'kv-1');
    expect(result.draft).toHaveLength(SINGLE_RESULT_LENGTH);
    expect(result.published).toHaveLength(SINGLE_RESULT_LENGTH);
  });

  it('returns empty arrays when neither matches', async () => {
    resetMocks();
    queueResult('agents', { data: [], error: null });
    queueResult('agent_versions', { data: [], error: null });
    const result = await findAgentsByKvStore(makeClient(), 'org-1', 'kv-1');
    expect(result.draft).toEqual([]);
    expect(result.published).toEqual([]);
  });

  it('propagates errors', async () => {
    resetMocks();
    queueResult('agents', { data: null, error: { code: '500', message: 'boom' } });
    queueResult('agent_versions', { data: [], error: null });
    const result = await findAgentsByKvStore(makeClient(), 'org-1', 'kv-1');
    expect(result.error).toBe('boom');
  });
});

describe('findAgentsByRagStore', () => {
  it('queries the rag column', async () => {
    resetMocks();
    queueResult('agents', { data: [], error: null });
    queueResult('agent_versions', { data: [], error: null });
    const sb = makeClient();
    const result = await findAgentsByRagStore(sb, 'org-1', 'rag-1');
    expect(result.error).toBeNull();
    expect(result.draft).toEqual([]);
    expect(result.published).toEqual([]);
  });
});
