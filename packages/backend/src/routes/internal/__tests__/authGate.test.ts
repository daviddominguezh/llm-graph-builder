import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import {
  EXECUTION_AUTH_MOCK,
  HTTP_UNAUTHORIZED,
  LIMIT,
  OFFSET,
  STORE_ID,
  TENANT_ID,
  buildApp,
  makeMockKv,
  makeMockRag,
} from './testHarness.js';

process.env.EDGE_FUNCTION_MASTER_KEY = 'test-key';

const mockKvSvc = makeMockKv();
const mockRagSvc = makeMockRag();

jest.unstable_mockModule('../../../services/kvStoreService.js', () => ({
  makeKvStoreService: jest.fn(() => mockKvSvc),
}));
jest.unstable_mockModule('../../../services/ragStoreService.js', () => ({
  makeRagStoreService: jest.fn(() => mockRagSvc),
}));
jest.unstable_mockModule('../../../db/queries/executionAuthQueries.js', () => ({
  createServiceClient: jest.fn(() => ({}) as unknown),
  ...EXECUTION_AUTH_MOCK,
}));

const { internalRouter } = await import('../internalRouter.js');
const app = buildApp(internalRouter, express);

const PATH = '/internal/tools/kv-store/list-keys';
const body = { tenantId: TENANT_ID, storeId: STORE_ID, offset: OFFSET, limit: LIMIT };

describe('auth gate', () => {
  it('rejects missing master key header', async () => {
    const res = await request(app).post(PATH).send(body);
    expect(res.status).toBe(HTTP_UNAUTHORIZED);
  });

  it('rejects wrong master key', async () => {
    const res = await request(app).post(PATH).set('x-master-key', 'wrong').send(body);
    expect(res.status).toBe(HTTP_UNAUTHORIZED);
  });
});
