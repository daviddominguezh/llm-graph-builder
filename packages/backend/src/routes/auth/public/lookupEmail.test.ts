import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

interface RpcResult {
  data: string[];
  error: null;
}

jest.unstable_mockModule('../../../db/client.js', () => ({
  serviceSupabase: jest.fn(() => ({
    rpc: jest.fn<() => Promise<RpcResult>>().mockResolvedValue({ data: ['email', 'google'], error: null }),
  })),
}));
jest.unstable_mockModule('../../../lib/auditLog.js', () => ({ auditLog: jest.fn() }));

const { lookupEmailRouter } = await import('./lookupEmail.js');

describe('POST /auth/public/lookup-email', () => {
  it('returns providers for existing email', async () => {
    const app = express().use(express.json());
    app.use('/auth/public', lookupEmailRouter());
    const res = await request(app).post('/auth/public/lookup-email').send({ email: 'a@b.com' });
    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ exists: true, providers: ['email', 'google'] });
  });

  it('rejects malformed email with 400', async () => {
    const app = express().use(express.json());
    app.use('/auth/public', lookupEmailRouter());
    const res = await request(app).post('/auth/public/lookup-email').send({ email: 'not-an-email' });
    expect(res.status).toBe(HTTP_BAD_REQUEST);
  });
});
