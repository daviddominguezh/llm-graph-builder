import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import type { RerankInput, RerankedRecord } from '../../../rag/rerank.js';
import { AUTH, HTTP_BAD, HTTP_OK, HTTP_UNAUTHORIZED, asBody, buildApp } from './testHarness.js';

process.env.EDGE_FUNCTION_MASTER_KEY = 'test-key';

const HTTP_NOT_FOUND = 404;

type EmbedFn = (text: string) => Promise<number[]>;
const mockEmbed = jest.fn<EmbedFn>();

type RerankFn = (input: RerankInput) => Promise<RerankedRecord[]>;
const mockRerank = jest.fn<RerankFn>();

jest.unstable_mockModule('../../../rag/embeddings.js', () => ({
  embedQuery: mockEmbed,
}));

jest.unstable_mockModule('../../../rag/rerank.js', () => ({
  rerankRecords: mockRerank,
}));

const { internalRouter } = await import('../internalRouter.js');
const app = buildApp(internalRouter, express);

beforeEach(() => {
  mockEmbed.mockReset();
  mockRerank.mockReset();
});

const ONE = 1;
const TWO = 2;
const THREE = 3;
const SCALE = 10;
const SAMPLE_VECTOR: number[] = [ONE / SCALE, TWO / SCALE, THREE / SCALE];
const SAMPLE_SCORE = 0.9;
const TOP_N = 1;
const SAMPLE_RERANKED: RerankedRecord[] = [{ id: 'b', score: SAMPLE_SCORE }];

describe('POST /internal/embed', () => {
  it('returns vector on success', async () => {
    mockEmbed.mockResolvedValue(SAMPLE_VECTOR);
    const res = await request(app).post('/internal/embed').set(AUTH).send({ text: 'hello' });
    expect(res.status).toBe(HTTP_OK);
    expect(asBody(res.body).vector).toEqual(SAMPLE_VECTOR);
    expect(mockEmbed).toHaveBeenCalledWith('hello');
  });

  it('rejects empty text via Zod', async () => {
    const res = await request(app).post('/internal/embed').set(AUTH).send({ text: '' });
    expect(res.status).toBe(HTTP_BAD);
  });

  it('rejects missing text field', async () => {
    const res = await request(app).post('/internal/embed').set(AUTH).send({});
    expect(res.status).toBe(HTTP_BAD);
  });
});

describe('POST /internal/rerank', () => {
  it('returns reranked records for a valid body', async () => {
    mockRerank.mockResolvedValue(SAMPLE_RERANKED);
    const body = { query: 'q', records: [{ id: 'b', content: 'y' }], topN: TOP_N };
    const res = await request(app).post('/internal/rerank').set(AUTH).send(body);
    expect(res.status).toBe(HTTP_OK);
    expect(asBody(res.body).records).toEqual(SAMPLE_RERANKED);
    expect(mockRerank).toHaveBeenCalledWith(body);
  });

  it('rejects a malformed body with 400', async () => {
    const res = await request(app).post('/internal/rerank').set(AUTH).send({ query: 'q' });
    expect(res.status).toBe(HTTP_BAD);
  });

  it('rejects an empty records array via Zod', async () => {
    const res = await request(app)
      .post('/internal/rerank')
      .set(AUTH)
      .send({ query: 'q', records: [], topN: TOP_N });
    expect(res.status).toBe(HTTP_BAD);
  });

  it('rejects a missing master key', async () => {
    const body = { query: 'q', records: [{ id: 'b', content: 'y' }], topN: TOP_N };
    const res = await request(app).post('/internal/rerank').send(body);
    expect(res.status).toBe(HTTP_UNAUTHORIZED);
  });
});

describe('removed POST /internal/regex/validate', () => {
  it('no longer exposes the regex validate route', async () => {
    const res = await request(app).post('/internal/regex/validate').set(AUTH).send({ pattern: 'foo' });
    expect(res.status).toBe(HTTP_NOT_FOUND);
  });
});
