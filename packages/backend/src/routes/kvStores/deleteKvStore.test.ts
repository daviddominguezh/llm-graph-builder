import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import type { AgentRef, AgentsByStoreResult } from '../../db/queries/agentStoreBindingsQueries.js';
import type { KvStoreRow } from '../../db/queries/kvStoresQueries.js';

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL = 500;

const STORE_ID = 'store-123';
const ORG_ID = 'org-abc';

const SAMPLE_STORE: KvStoreRow = {
  id: STORE_ID,
  org_id: ORG_ID,
  name: 'KV',
  slug: 'kv',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

type GetKvStoreByIdFn = (
  supabase: unknown,
  storeId: string
) => Promise<{ result: KvStoreRow | null; error: string | null }>;
type DeleteKvStoreFn = (supabase: unknown, storeId: string) => Promise<{ error: string | null }>;
type FindAgentsByKvStoreFn = (
  supabase: unknown,
  orgId: string,
  storeId: string
) => Promise<AgentsByStoreResult>;

const mockGetKvStoreById = jest.fn<GetKvStoreByIdFn>();
const mockDeleteKvStore = jest.fn<DeleteKvStoreFn>();
const mockFindAgentsByKvStore = jest.fn<FindAgentsByKvStoreFn>();

jest.unstable_mockModule('../../db/queries/kvStoresQueries.js', () => ({
  getKvStoreById: mockGetKvStoreById,
  deleteKvStore: mockDeleteKvStore,
}));

jest.unstable_mockModule('../../db/queries/agentStoreBindingsQueries.js', () => ({
  findAgentsByKvStore: mockFindAgentsByKvStore,
}));

const { handleDeleteKvStore } = await import('./deleteKvStore.js');

function makeApp(): express.Express {
  const app = express().use(express.json());
  app.use((_req, res, next) => {
    Object.assign(res.locals, { supabase: {}, userId: 'user-1' });
    next();
  });
  app.delete('/kv-stores/:storeId', handleDeleteKvStore);
  return app;
}

function resetMocks(): void {
  mockGetKvStoreById.mockReset();
  mockDeleteKvStore.mockReset();
  mockFindAgentsByKvStore.mockReset();
  mockGetKvStoreById.mockResolvedValue({ result: SAMPLE_STORE, error: null });
}

const DRAFT_REF: AgentRef = { id: 'a1', slug: 'agent-1', name: 'Agent 1' };
const PUBLISHED_REF: AgentRef = { id: 'a2', slug: 'agent-2', name: 'Agent 2' };

describe('DELETE /kv-stores/:storeId — draft-only conflict', () => {
  it('returns 409 in_use when only draft agents reference the store', async () => {
    resetMocks();
    mockFindAgentsByKvStore.mockResolvedValueOnce({
      draft: [DRAFT_REF],
      published: [],
      error: null,
    });
    const res = await request(makeApp()).delete(`/kv-stores/${STORE_ID}`);
    expect(res.status).toBe(HTTP_CONFLICT);
    expect(res.body).toEqual({ error: 'in_use', draft: [DRAFT_REF], published: [] });
    expect(mockDeleteKvStore).not.toHaveBeenCalled();
  });
});

describe('DELETE /kv-stores/:storeId — published-only conflict', () => {
  it('returns 409 in_use when only published agents reference the store', async () => {
    resetMocks();
    mockFindAgentsByKvStore.mockResolvedValueOnce({
      draft: [],
      published: [PUBLISHED_REF],
      error: null,
    });
    const res = await request(makeApp()).delete(`/kv-stores/${STORE_ID}`);
    expect(res.status).toBe(HTTP_CONFLICT);
    expect(res.body).toEqual({ error: 'in_use', draft: [], published: [PUBLISHED_REF] });
    expect(mockDeleteKvStore).not.toHaveBeenCalled();
  });
});

describe('DELETE /kv-stores/:storeId — both arrays populated', () => {
  it('returns 409 in_use with both arrays populated', async () => {
    resetMocks();
    mockFindAgentsByKvStore.mockResolvedValueOnce({
      draft: [DRAFT_REF],
      published: [PUBLISHED_REF],
      error: null,
    });
    const res = await request(makeApp()).delete(`/kv-stores/${STORE_ID}`);
    expect(res.status).toBe(HTTP_CONFLICT);
    expect(res.body).toEqual({ error: 'in_use', draft: [DRAFT_REF], published: [PUBLISHED_REF] });
    expect(mockDeleteKvStore).not.toHaveBeenCalled();
  });
});

describe('DELETE /kv-stores/:storeId — no references', () => {
  it('proceeds to delete and returns 200 when no agents reference the store', async () => {
    resetMocks();
    mockFindAgentsByKvStore.mockResolvedValueOnce({ draft: [], published: [], error: null });
    mockDeleteKvStore.mockResolvedValueOnce({ error: null });
    const res = await request(makeApp()).delete(`/kv-stores/${STORE_ID}`);
    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ success: true });
    expect(mockDeleteKvStore).toHaveBeenCalledWith(expect.any(Object), STORE_ID);
  });
});

describe('DELETE /kv-stores/:storeId — error paths', () => {
  it('returns 404 not_found when the store does not exist', async () => {
    resetMocks();
    mockGetKvStoreById.mockResolvedValueOnce({ result: null, error: null });
    const res = await request(makeApp()).delete(`/kv-stores/${STORE_ID}`);
    expect(res.status).toBe(HTTP_NOT_FOUND);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('returns 500 when the guard query errors', async () => {
    resetMocks();
    mockFindAgentsByKvStore.mockResolvedValueOnce({
      draft: [],
      published: [],
      error: 'db boom',
    });
    const res = await request(makeApp()).delete(`/kv-stores/${STORE_ID}`);
    expect(res.status).toBe(HTTP_INTERNAL);
    expect(res.body).toEqual({ error: 'db boom' });
  });
});
