import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { createPerOrgRateLimiter } from '../rateLimitPerOrg.js';

const HTTP_OK = 200;
const HTTP_TOO_MANY = 429;
const LIMIT_THREE = 3;
const LIMIT_ONE = 1;
const WINDOW_60S = 60_000;
const INCREMENT = 1;

function buildApp(orgIdResolver: () => Promise<string | null>, limit: number): express.Express {
  const app = express();
  const limiter = createPerOrgRateLimiter({
    limit,
    windowMs: WINDOW_60S,
    resolveOrgId: jest.fn(async () => await orgIdResolver()),
  });
  app.get('/test', limiter, (_req, res) => {
    res.status(HTTP_OK).json({ ok: true });
  });
  return app;
}

describe('createPerOrgRateLimiter', () => {
  it('allows up to the limit and rejects above', async () => {
    const app = buildApp(async () => await Promise.resolve('org-a'), LIMIT_THREE);

    const res1 = await request(app).get('/test');
    expect(res1.status).toBe(HTTP_OK);

    const res2 = await request(app).get('/test');
    expect(res2.status).toBe(HTTP_OK);

    const res3 = await request(app).get('/test');
    expect(res3.status).toBe(HTTP_OK);

    const over = await request(app).get('/test');
    expect(over.status).toBe(HTTP_TOO_MANY);
  });

  it('counts orgs independently', async () => {
    const orgIds = ['org-a', 'org-b'];
    let call = 0;
    const resolver = async (): Promise<string | null> => {
      const id = orgIds[call] ?? null;
      call += INCREMENT;
      return await Promise.resolve(id);
    };
    const app = buildApp(resolver, LIMIT_ONE);

    const res1 = await request(app).get('/test');
    expect(res1.status).toBe(HTTP_OK);

    const res2 = await request(app).get('/test');
    expect(res2.status).toBe(HTTP_OK);
  });

  it('passes through when resolver returns null (let route 404)', async () => {
    const app = buildApp(async () => await Promise.resolve(null), LIMIT_ONE);

    const res = await request(app).get('/test');
    expect(res.status).toBe(HTTP_OK);

    const res2 = await request(app).get('/test');
    expect(res2.status).toBe(HTTP_OK);
  });
});
