import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const HTTP_OK = 200;
const HTTP_INTERNAL = 500;

interface SafeIdentity {
  provider: string;
  email: string;
  created_at: string;
}

interface RpcResult {
  data: SafeIdentity[] | null;
  error: { message: string } | null;
}

const mockRpc = jest.fn<() => Promise<RpcResult>>().mockResolvedValue({
  data: [{ provider: 'google', email: 'user@example.com', created_at: '2026-01-01T00:00:00Z' }],
  error: null,
});

jest.unstable_mockModule('../../db/client.js', () => ({
  serviceSupabase: jest.fn(() => ({ rpc: mockRpc })),
}));
function passGate(_req: unknown, _res: unknown, next: () => void): void {
  next();
}
jest.unstable_mockModule('../../middleware/gates.js', () => ({
  requireOnboardingIncomplete: passGate,
  requireGateComplete: passGate,
  requirePhoneUnverified: passGate,
}));

const { identitiesRouter } = await import('./identities.js');

const USER_ID = 'user-test-123';

function makeApp(userId = USER_ID): express.Express {
  const app = express().use(express.json());
  app.use((req, res, next) => {
    Object.assign(res.locals, { userId });
    next();
  });
  app.use('/auth', identitiesRouter());
  return app;
}

describe('GET /auth/identities — happy path', () => {
  it('returns 200 with identity array on success', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ provider: 'google', email: 'user@example.com', created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    });

    const res = await request(makeApp()).get('/auth/identities');

    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({
      identities: [{ provider: 'google', email: 'user@example.com', created_at: '2026-01-01T00:00:00Z' }],
    });
  });
});

describe('GET /auth/identities — RPC error', () => {
  it('returns 500 with identities_failed on RPC error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'db error' } });

    const res = await request(makeApp()).get('/auth/identities');

    expect(res.status).toBe(HTTP_INTERNAL);
    expect(res.body).toEqual({ error: 'identities_failed' });
  });
});

describe('GET /auth/identities — empty result', () => {
  it('returns 200 with empty array when user has no identities', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const res = await request(makeApp()).get('/auth/identities');

    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ identities: [] });
  });
});
