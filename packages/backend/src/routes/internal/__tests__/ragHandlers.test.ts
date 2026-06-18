import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import {
  AUTH,
  EXECUTION_AUTH_MOCK,
  HALF,
  HTTP_BAD,
  HTTP_OK,
  LIMIT,
  OFFSET,
  ONE,
  STORE_ID,
  TENANT_ID,
  ZERO,
  asBody,
  buildApp,
  makeMockKv,
  makeMockRag,
  resetRagMocks,
} from './testHarness.js';

process.env.EDGE_FUNCTION_MASTER_KEY = 'test-key';

const mockKvSvc = makeMockKv();
const mockRagSvc = makeMockRag();
const mockMakeKv = jest.fn(() => mockKvSvc);
const mockMakeRag = jest.fn(() => mockRagSvc);
const mockCreateClient = jest.fn(() => ({}) as unknown);

jest.unstable_mockModule('../../../services/kvStoreService.js', () => ({
  makeKvStoreService: mockMakeKv,
}));
jest.unstable_mockModule('../../../services/ragStoreService.js', () => ({
  makeRagStoreService: mockMakeRag,
}));
jest.unstable_mockModule('../../../db/queries/executionAuthQueries.js', () => ({
  createServiceClient: mockCreateClient,
  ...EXECUTION_AUTH_MOCK,
}));

const { internalRouter } = await import('../internalRouter.js');
const app = buildApp(internalRouter, express);

const RAG_PATH = '/internal/tools/rag/search';

const emptyResult = { items: [], total: ZERO, offset: OFFSET, limit: LIMIT };

interface Bm25 {
  tenantId: string;
  storeId: string;
  mode: 'bm25';
  query: string;
  offset: number;
  limit: number;
}
interface SemanticOrHybrid {
  tenantId: string;
  storeId: string;
  mode: 'semantic' | 'hybrid';
  query: string;
  minSimilarity: number;
  offset: number;
  limit: number;
}
interface Regex {
  tenantId: string;
  storeId: string;
  mode: 'regex';
  pattern: string;
  offset: number;
  limit: number;
}

function bm25Body(): Bm25 {
  return {
    tenantId: TENANT_ID,
    storeId: STORE_ID,
    mode: 'bm25',
    query: 'hi',
    offset: OFFSET,
    limit: LIMIT,
  };
}

function semanticBody(): SemanticOrHybrid {
  return {
    tenantId: TENANT_ID,
    storeId: STORE_ID,
    mode: 'semantic',
    query: 'hi',
    minSimilarity: HALF,
    offset: OFFSET,
    limit: LIMIT,
  };
}

function hybridBody(): SemanticOrHybrid {
  return { ...semanticBody(), mode: 'hybrid' };
}

function regexBody(): Regex {
  return {
    tenantId: TENANT_ID,
    storeId: STORE_ID,
    mode: 'regex',
    pattern: 'foo',
    offset: OFFSET,
    limit: LIMIT,
  };
}

beforeEach(() => {
  resetRagMocks(mockRagSvc);
});

describe('POST /internal/tools/rag/search', () => {
  it('dispatches bm25 by tenantId/query/offset/limit', async () => {
    mockRagSvc.searchBm25.mockResolvedValue({ items: ['chunk'], total: ONE, offset: OFFSET, limit: LIMIT });
    const res = await request(app).post(RAG_PATH).set(AUTH).send(bm25Body());
    expect(res.status).toBe(HTTP_OK);
    expect(mockRagSvc.searchBm25).toHaveBeenCalledWith(TENANT_ID, 'hi', OFFSET, LIMIT);
  });

  it('dispatches semantic with minSimilarity', async () => {
    mockRagSvc.searchSemantic.mockResolvedValue(emptyResult);
    const res = await request(app).post(RAG_PATH).set(AUTH).send(semanticBody());
    expect(res.status).toBe(HTTP_OK);
    expect(mockRagSvc.searchSemantic).toHaveBeenCalled();
  });

  it('dispatches hybrid with minSimilarity', async () => {
    mockRagSvc.searchHybrid.mockResolvedValue(emptyResult);
    const res = await request(app).post(RAG_PATH).set(AUTH).send(hybridBody());
    expect(res.status).toBe(HTTP_OK);
    expect(mockRagSvc.searchHybrid).toHaveBeenCalled();
  });

  it('dispatches regex with pattern', async () => {
    mockRagSvc.searchRegex.mockResolvedValue(emptyResult);
    const res = await request(app).post(RAG_PATH).set(AUTH).send(regexBody());
    expect(res.status).toBe(HTTP_OK);
    expect(mockRagSvc.searchRegex).toHaveBeenCalled();
  });

  it('rejects invalid mode via Zod', async () => {
    const res = await request(app)
      .post(RAG_PATH)
      .set(AUTH)
      .send({ tenantId: TENANT_ID, storeId: STORE_ID, mode: 'xx', offset: OFFSET, limit: LIMIT });
    expect(res.status).toBe(HTTP_BAD);
    expect(asBody(res.body).ok).toBe(false);
  });
});
