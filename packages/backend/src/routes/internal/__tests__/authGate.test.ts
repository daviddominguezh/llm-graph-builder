import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { HTTP_UNAUTHORIZED, buildApp } from './testHarness.js';

process.env.EDGE_FUNCTION_MASTER_KEY = 'test-key';

type EmbedFn = (text: string) => Promise<number[]>;
jest.unstable_mockModule('../../../rag/embeddings.js', () => ({
  embedQuery: jest.fn<EmbedFn>(),
}));

const { internalRouter } = await import('../internalRouter.js');
const app = buildApp(internalRouter, express);

const TOP_N = 1;
const PATH = '/internal/rerank';
const body = { query: 'foo', records: [{ id: 'a', content: 'b' }], topN: TOP_N };

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
