import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { AUTH, HTTP_BAD, HTTP_OK, asBody, buildApp } from './testHarness.js';

process.env.EDGE_FUNCTION_MASTER_KEY = 'test-key';

type EmbedFn = (text: string) => Promise<number[]>;
const mockEmbed = jest.fn<EmbedFn>();

jest.unstable_mockModule('../../../rag/embeddings.js', () => ({
  embedQuery: mockEmbed,
}));

const { internalRouter } = await import('../internalRouter.js');
const app = buildApp(internalRouter, express);

beforeEach(() => {
  mockEmbed.mockReset();
});

const ONE = 1;
const TWO = 2;
const THREE = 3;
const SCALE = 10;
const SAMPLE_VECTOR: number[] = [ONE / SCALE, TWO / SCALE, THREE / SCALE];

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

describe('POST /internal/regex/validate', () => {
  it('returns ok:true for valid pattern', async () => {
    const res = await request(app).post('/internal/regex/validate').set(AUTH).send({ pattern: 'foo.*bar' });
    expect(res.status).toBe(HTTP_OK);
    expect(asBody(res.body).ok).toBe(true);
  });

  it('returns ok:false with error for invalid pattern', async () => {
    const res = await request(app).post('/internal/regex/validate').set(AUTH).send({ pattern: '(' });
    expect(res.status).toBe(HTTP_BAD);
    expect(asBody(res.body).ok).toBe(false);
    expect(typeof asBody(res.body).error).toBe('string');
  });

  it('rejects empty pattern via Zod', async () => {
    const res = await request(app).post('/internal/regex/validate').set(AUTH).send({ pattern: '' });
    expect(res.status).toBe(HTTP_BAD);
  });
});
