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

const PATH = '/internal/regex/validate';
const body = { pattern: 'foo' };

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
