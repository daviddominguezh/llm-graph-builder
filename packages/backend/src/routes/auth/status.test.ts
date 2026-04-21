import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const HTTP_OK = 200;
const HTTP_INTERNAL = 500;

interface UserRow {
  onboarding_completed_at: string | null;
  grandfathered_at: string | null;
}

interface SingleResult {
  data: UserRow | null;
  error: { message: string } | null;
}

interface AuthGetUserResult {
  data: { user: { phone_confirmed_at: string | null } | null };
  error: { message: string } | null;
}

interface EqSingleChain {
  eq: (col: string, val: string) => EqSingleChain;
  single: () => Promise<SingleResult>;
}

interface SelectChain {
  eq: (col: string, val: string) => EqSingleChain;
}

interface MockFromResult {
  select: (cols: string) => SelectChain;
}

const mockSingle = jest.fn<() => Promise<SingleResult>>();
const mockGetUser = jest.fn<() => Promise<AuthGetUserResult>>();

const eqSingleChain: EqSingleChain = {
  eq: jest.fn<(col: string, val: string) => EqSingleChain>().mockReturnThis(),
  single: mockSingle,
};

const mockFrom = jest.fn<(table: string) => MockFromResult>().mockReturnValue({
  select: jest.fn<(cols: string) => SelectChain>().mockReturnValue({
    eq: jest.fn<(col: string, val: string) => EqSingleChain>().mockReturnValue(eqSingleChain),
  }),
});

const { statusRouter } = await import('./status.js');

const USER_ID = 'user-abc';

function buildLocals(userId: string): Record<string, unknown> {
  return {
    userId,
    supabase: {
      from: mockFrom,
      auth: { getUser: mockGetUser },
    },
  };
}

function makeApp(userId = USER_ID): express.Express {
  const app = express().use(express.json());
  app.use((_req, res, next) => {
    Object.assign(res.locals, buildLocals(userId));
    next();
  });
  app.use('/auth', statusRouter());
  return app;
}

function mockUserRow(row: UserRow): void {
  mockSingle.mockResolvedValueOnce({ data: row, error: null });
}

function mockUserRowError(): void {
  mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'db error' } });
}

function mockAuthUser(phoneConfirmedAt: string | null): void {
  mockGetUser.mockResolvedValueOnce({
    data: { user: { phone_confirmed_at: phoneConfirmedAt } },
    error: null,
  });
}

function mockAuthUserError(): void {
  mockGetUser.mockResolvedValueOnce({
    data: { user: null },
    error: { message: 'auth error' },
  });
}

describe('GET /auth/status — both flags true', () => {
  it('returns 200 with phone_verified and onboarding_completed both true', async () => {
    mockUserRow({ onboarding_completed_at: '2025-01-01', grandfathered_at: null });
    mockAuthUser('2025-01-01');

    const res = await request(makeApp()).get('/auth/status');

    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ phone_verified: true, onboarding_completed: true });
  });
});

describe('GET /auth/status — grandfathered user', () => {
  it('returns phone_verified true when grandfathered_at is set but phone_confirmed_at is null', async () => {
    mockUserRow({ onboarding_completed_at: '2025-01-01', grandfathered_at: '2024-06-01' });
    mockAuthUser(null);

    const res = await request(makeApp()).get('/auth/status');

    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ phone_verified: true, onboarding_completed: true });
  });
});

describe('GET /auth/status — neither flag set', () => {
  it('returns both flags false when no dates are set', async () => {
    mockUserRow({ onboarding_completed_at: null, grandfathered_at: null });
    mockAuthUser(null);

    const res = await request(makeApp()).get('/auth/status');

    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ phone_verified: false, onboarding_completed: false });
  });
});

describe('GET /auth/status — error cases', () => {
  it('returns 500 when users fetch fails', async () => {
    mockUserRowError();
    mockAuthUser(null);

    const res = await request(makeApp()).get('/auth/status');

    expect(res.status).toBe(HTTP_INTERNAL);
    expect(res.body).toEqual({ error: 'status_failed' });
  });

  it('returns 500 when getUser fails', async () => {
    mockUserRow({ onboarding_completed_at: null, grandfathered_at: null });
    mockAuthUserError();

    const res = await request(makeApp()).get('/auth/status');

    expect(res.status).toBe(HTTP_INTERNAL);
    expect(res.body).toEqual({ error: 'status_failed' });
  });
});
