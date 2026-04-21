import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

interface RpcResult {
  data: { duplicate: boolean; email: string } | null;
  error: { message: string } | null;
}

jest.unstable_mockModule('../../../db/client.js', () => ({
  serviceSupabase: jest.fn(() => ({
    rpc: jest.fn<() => Promise<RpcResult>>().mockResolvedValue({
      data: { duplicate: true, email: 'a@b.com' },
      error: null,
    }),
  })),
}));
jest.unstable_mockModule('../../../lib/auditLog.js', () => ({ auditLog: jest.fn() }));

const { handleOauthDuplicateRouter } = await import('./handleOauthDuplicate.js');

describe('POST /auth/public/handle-oauth-duplicate', () => {
  it('calls reject_oauth_duplicate RPC and returns payload', async () => {
    const app = express().use(express.json());
    app.use((req, res, next) => {
      res.locals['userId'] = 'u1';
      next();
    });
    app.use('/auth/public', handleOauthDuplicateRouter());
    const res = await request(app).post('/auth/public/handle-oauth-duplicate');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ duplicate: true, email: 'a@b.com' });
  });
});
