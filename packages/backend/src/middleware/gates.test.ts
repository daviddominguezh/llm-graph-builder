import { describe, expect, it, jest } from '@jest/globals';
import type { RequestHandler } from 'express';
import express from 'express';
import request from 'supertest';

import { requireGateComplete, requireOnboardingIncomplete, requirePhoneUnverified } from './gates.js';

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

interface AuthGetUserResult {
  data: { user: { phone_confirmed_at: string | null } | null };
  error: null;
}

interface DbQueryResult {
  data: {
    onboarding_completed_at: string | null;
    grandfathered_at: string | null;
  } | null;
  error: null;
}

interface MockSupabase {
  from: jest.Mock;
  auth: { getUser: jest.Mock<() => Promise<AuthGetUserResult>> };
}

function mockSupabaseReturning(row: {
  onboarding_completed_at: string | null;
  grandfathered_at: string | null;
  phone_confirmed_at: string | null;
}): MockSupabase {
  const single = jest.fn<() => Promise<DbQueryResult>>().mockResolvedValue({ data: row, error: null });
  const eq = jest.fn(() => ({ single }));
  const select = jest.fn(() => ({ eq }));
  return {
    from: jest.fn(() => ({ select })),
    auth: {
      getUser: jest.fn<() => Promise<AuthGetUserResult>>().mockResolvedValue({
        data: { user: { phone_confirmed_at: row.phone_confirmed_at } },
        error: null,
      }),
    },
  };
}

function buildApp(middleware: RequestHandler, supabase: MockSupabase): express.Express {
  const app = express();
  app.use((_req, res, next) => {
    Object.assign(res.locals, { supabase, userId: 'u1' });
    next();
  });
  app.get('/test', middleware, (_req, res) => {
    res.status(HTTP_OK).json({ ok: true });
  });
  return app;
}

describe('requireGateComplete — success cases', () => {
  it('calls next when both flags true', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: 'x',
      grandfathered_at: null,
      phone_confirmed_at: 'x',
    });
    const app = buildApp(requireGateComplete, supabase);
    const res = await request(app).get('/test');
    expect(res.status).toBe(HTTP_OK);
  });

  it('passes when grandfathered_at is set even if phone_confirmed_at is null', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: 'x',
      grandfathered_at: 'x',
      phone_confirmed_at: null,
    });
    const app = buildApp(requireGateComplete, supabase);
    const res = await request(app).get('/test');
    expect(res.status).toBe(HTTP_OK);
  });
});

describe('requireGateComplete — failure cases', () => {
  it('403 when phone not verified', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: 'x',
      grandfathered_at: null,
      phone_confirmed_at: null,
    });
    const app = buildApp(requireGateComplete, supabase);
    const res = await request(app).get('/test');
    expect(res.status).toBe(HTTP_FORBIDDEN);
  });

  it('403 when onboarding_completed_at is null but phone is verified', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: null,
      grandfathered_at: null,
      phone_confirmed_at: 'x',
    });
    const app = buildApp(requireGateComplete, supabase);
    const res = await request(app).get('/test');
    expect(res.status).toBe(HTTP_FORBIDDEN);
  });
});

describe('requirePhoneUnverified', () => {
  it('calls next when phone_confirmed_at is null', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: null,
      grandfathered_at: null,
      phone_confirmed_at: null,
    });
    const app = buildApp(requirePhoneUnverified, supabase);
    const res = await request(app).get('/test');
    expect(res.status).toBe(HTTP_OK);
  });

  it('403 when phone_confirmed_at is set', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: null,
      grandfathered_at: null,
      phone_confirmed_at: 'x',
    });
    const app = buildApp(requirePhoneUnverified, supabase);
    const res = await request(app).get('/test');
    expect(res.status).toBe(HTTP_FORBIDDEN);
  });
});

describe('requireOnboardingIncomplete', () => {
  it('calls next when onboarding_completed_at is null', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: null,
      grandfathered_at: null,
      phone_confirmed_at: null,
    });
    const app = buildApp(requireOnboardingIncomplete, supabase);
    const res = await request(app).get('/test');
    expect(res.status).toBe(HTTP_OK);
  });

  it('403 when onboarding_completed_at is set', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: 'x',
      grandfathered_at: null,
      phone_confirmed_at: null,
    });
    const app = buildApp(requireOnboardingIncomplete, supabase);
    const res = await request(app).get('/test');
    expect(res.status).toBe(HTTP_FORBIDDEN);
  });
});
