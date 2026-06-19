import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { AUTH, EXECUTION_AUTH_MOCK, HTTP_BAD, HTTP_OK, buildApp, makeMockKv, makeMockRag } from './testHarness.js';

process.env.EDGE_FUNCTION_MASTER_KEY = 'test-key';

type EmbedFn = (text: string) => Promise<number[]>;
const mockEmbed = jest.fn<EmbedFn>();

jest.unstable_mockModule('../../../rag/embeddings.js', () => ({
  embedQuery: mockEmbed,
}));
jest.unstable_mockModule('../../../services/kvStoreService.js', () => ({
  makeKvStoreService: jest.fn(() => makeMockKv()),
}));
jest.unstable_mockModule('../../../services/ragStoreService.js', () => ({
  makeRagStoreService: jest.fn(() => makeMockRag()),
}));
jest.unstable_mockModule('../../../db/queries/executionAuthQueries.js', () => ({
  createServiceClient: jest.fn(() => ({}) as unknown),
  ...EXECUTION_AUTH_MOCK,
}));

const { internalRouter } = await import('../internalRouter.js');
const app = buildApp(internalRouter, express);

interface EmbedBody {
  vector?: number[];
  error?: string;
}
interface RegexBody {
  ok?: boolean;
  error?: string;
}

function asEmbed(value: unknown): EmbedBody {
  if (typeof value !== 'object' || value === null) return {};
  return value as EmbedBody;
}
function asRegex(value: unknown): RegexBody {
  if (typeof value !== 'object' || value === null) return {};
  return value as RegexBody;
}

beforeEach(() => {
  mockEmbed.mockReset();
});

describe('POST /internal/embed', () => {
  it('returns vector on success', async () => {
    mockEmbed.mockResolvedValue([0.1, 0.2, 0.3]);
    const res = await request(app).post('/internal/embed').set(AUTH).send({ text: 'hello' });
    expect(res.status).toBe(HTTP_OK);
    expect(asEmbed(res.body).vector).toEqual([0.1, 0.2, 0.3]);
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
    expect(asRegex(res.body).ok).toBe(true);
  });

  it('returns ok:false with error for invalid pattern', async () => {
    const res = await request(app).post('/internal/regex/validate').set(AUTH).send({ pattern: '(' });
    expect(res.status).toBe(HTTP_BAD);
    expect(asRegex(res.body).ok).toBe(false);
    expect(typeof asRegex(res.body).error).toBe('string');
  });

  it('rejects empty pattern via Zod', async () => {
    const res = await request(app).post('/internal/regex/validate').set(AUTH).send({ pattern: '' });
    expect(res.status).toBe(HTTP_BAD);
  });
});
