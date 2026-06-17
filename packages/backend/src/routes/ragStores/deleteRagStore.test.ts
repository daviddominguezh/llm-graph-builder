import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import type { AgentRef, AgentsByStoreResult } from '../../db/queries/agentStoreBindingsQueries.js';
import type { RagStoreRow } from '../../db/queries/ragStoresQueries.js';

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL = 500;

const STORE_ID = 'rag-store-123';
const ORG_ID = 'org-abc';

const SAMPLE_STORE: RagStoreRow = {
  id: STORE_ID,
  org_id: ORG_ID,
  name: 'RAG',
  slug: 'rag',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

type GetRagStoreByIdFn = (
  supabase: unknown,
  storeId: string
) => Promise<{ result: RagStoreRow | null; error: string | null }>;
type DeleteRagStoreFn = (supabase: unknown, storeId: string) => Promise<{ error: string | null }>;
type FindAgentsByRagStoreFn = (
  supabase: unknown,
  orgId: string,
  storeId: string
) => Promise<AgentsByStoreResult>;

const mockGetRagStoreById = jest.fn<GetRagStoreByIdFn>();
const mockDeleteRagStore = jest.fn<DeleteRagStoreFn>();
const mockFindAgentsByRagStore = jest.fn<FindAgentsByRagStoreFn>();

jest.unstable_mockModule('../../db/queries/ragStoresQueries.js', () => ({
  getRagStoreById: mockGetRagStoreById,
  deleteRagStore: mockDeleteRagStore,
}));

jest.unstable_mockModule('../../db/queries/agentStoreBindingsQueries.js', () => ({
  findAgentsByRagStore: mockFindAgentsByRagStore,
}));

const { handleDeleteRagStore } = await import('./deleteRagStore.js');

function makeApp(): express.Express {
  const app = express().use(express.json());
  app.use((_req, res, next) => {
    Object.assign(res.locals, { supabase: {}, userId: 'user-1' });
    next();
  });
  app.delete('/rag-stores/:storeId', handleDeleteRagStore);
  return app;
}

function resetMocks(): void {
  mockGetRagStoreById.mockReset();
  mockDeleteRagStore.mockReset();
  mockFindAgentsByRagStore.mockReset();
  mockGetRagStoreById.mockResolvedValue({ result: SAMPLE_STORE, error: null });
}

const DRAFT_REF: AgentRef = { id: 'a1', slug: 'agent-1', name: 'Agent 1' };
const PUBLISHED_REF: AgentRef = { id: 'a2', slug: 'agent-2', name: 'Agent 2' };

describe('DELETE /rag-stores/:storeId — draft-only conflict', () => {
  it('returns 409 in_use when only draft agents reference the store', async () => {
    resetMocks();
    mockFindAgentsByRagStore.mockResolvedValueOnce({
      draft: [DRAFT_REF],
      published: [],
      error: null,
    });
    const res = await request(makeApp()).delete(`/rag-stores/${STORE_ID}`);
    expect(res.status).toBe(HTTP_CONFLICT);
    expect(res.body).toEqual({ error: 'in_use', draft: [DRAFT_REF], published: [] });
    expect(mockDeleteRagStore).not.toHaveBeenCalled();
  });
});

describe('DELETE /rag-stores/:storeId — published-only conflict', () => {
  it('returns 409 in_use when only published agents reference the store', async () => {
    resetMocks();
    mockFindAgentsByRagStore.mockResolvedValueOnce({
      draft: [],
      published: [PUBLISHED_REF],
      error: null,
    });
    const res = await request(makeApp()).delete(`/rag-stores/${STORE_ID}`);
    expect(res.status).toBe(HTTP_CONFLICT);
    expect(res.body).toEqual({ error: 'in_use', draft: [], published: [PUBLISHED_REF] });
    expect(mockDeleteRagStore).not.toHaveBeenCalled();
  });
});

describe('DELETE /rag-stores/:storeId — both arrays populated', () => {
  it('returns 409 in_use with both arrays populated', async () => {
    resetMocks();
    mockFindAgentsByRagStore.mockResolvedValueOnce({
      draft: [DRAFT_REF],
      published: [PUBLISHED_REF],
      error: null,
    });
    const res = await request(makeApp()).delete(`/rag-stores/${STORE_ID}`);
    expect(res.status).toBe(HTTP_CONFLICT);
    expect(res.body).toEqual({ error: 'in_use', draft: [DRAFT_REF], published: [PUBLISHED_REF] });
    expect(mockDeleteRagStore).not.toHaveBeenCalled();
  });
});

describe('DELETE /rag-stores/:storeId — no references', () => {
  it('proceeds to delete and returns 200 when no agents reference the store', async () => {
    resetMocks();
    mockFindAgentsByRagStore.mockResolvedValueOnce({ draft: [], published: [], error: null });
    mockDeleteRagStore.mockResolvedValueOnce({ error: null });
    const res = await request(makeApp()).delete(`/rag-stores/${STORE_ID}`);
    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ success: true });
    expect(mockDeleteRagStore).toHaveBeenCalledWith(expect.any(Object), STORE_ID);
  });
});

describe('DELETE /rag-stores/:storeId — error paths', () => {
  it('returns 404 not_found when the store does not exist', async () => {
    resetMocks();
    mockGetRagStoreById.mockResolvedValueOnce({ result: null, error: null });
    const res = await request(makeApp()).delete(`/rag-stores/${STORE_ID}`);
    expect(res.status).toBe(HTTP_NOT_FOUND);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('returns 500 when the guard query errors', async () => {
    resetMocks();
    mockFindAgentsByRagStore.mockResolvedValueOnce({
      draft: [],
      published: [],
      error: 'db boom',
    });
    const res = await request(makeApp()).delete(`/rag-stores/${STORE_ID}`);
    expect(res.status).toBe(HTTP_INTERNAL);
    expect(res.body).toEqual({ error: 'db boom' });
  });
});
