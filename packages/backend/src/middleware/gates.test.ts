import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, jest } from '@jest/globals';

import { requireGateComplete, requireOnboardingIncomplete, requirePhoneUnverified } from './gates.js';

type AuthGetUserResult = {
  data: { user: { phone_confirmed_at: string | null } | null };
  error: null;
};

type DbQueryResult = {
  data: {
    onboarding_completed_at: string | null;
    grandfathered_at: string | null;
  } | null;
  error: null;
};

type MockSupabase = {
  from: jest.Mock;
  auth: { getUser: jest.Mock<() => Promise<AuthGetUserResult>> };
};

type MockResponse = {
  locals: { supabase: MockSupabase; userId: string };
  status: jest.Mock;
  json: jest.Mock;
};

function buildReqRes(supabase: MockSupabase, userId = 'u1') {
  const req = {} as unknown as Request;
  const mockRes: MockResponse = {
    locals: { supabase, userId },
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const res = mockRes as unknown as Response;
  const next = jest.fn() as unknown as NextFunction;
  return { req, res, next, mockRes };
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

describe('requireGateComplete', () => {
  it('calls next when both flags true', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: 'x',
      grandfathered_at: null,
      phone_confirmed_at: 'x',
    });
    const { req, res, next, mockRes } = buildReqRes(supabase);
    await requireGateComplete(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('403 when phone not verified', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: 'x',
      grandfathered_at: null,
      phone_confirmed_at: null,
    });
    const { req, res, next, mockRes } = buildReqRes(supabase);
    await requireGateComplete(req, res, next);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('403 when onboarding_completed_at is null but phone is verified', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: null,
      grandfathered_at: null,
      phone_confirmed_at: 'x',
    });
    const { req, res, next, mockRes } = buildReqRes(supabase);
    await requireGateComplete(req, res, next);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes when grandfathered_at is set even if phone_confirmed_at is null', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: 'x',
      grandfathered_at: 'x',
      phone_confirmed_at: null,
    });
    const { req, res, next, mockRes } = buildReqRes(supabase);
    await requireGateComplete(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});

describe('requirePhoneUnverified', () => {
  it('calls next when phone_confirmed_at is null', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: null,
      grandfathered_at: null,
      phone_confirmed_at: null,
    });
    const { req, res, next, mockRes } = buildReqRes(supabase);
    await requirePhoneUnverified(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('403 when phone_confirmed_at is set', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: null,
      grandfathered_at: null,
      phone_confirmed_at: 'x',
    });
    const { req, res, next, mockRes } = buildReqRes(supabase);
    await requirePhoneUnverified(req, res, next);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireOnboardingIncomplete', () => {
  it('calls next when onboarding_completed_at is null', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: null,
      grandfathered_at: null,
      phone_confirmed_at: null,
    });
    const { req, res, next, mockRes } = buildReqRes(supabase);
    await requireOnboardingIncomplete(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('403 when onboarding_completed_at is set', async () => {
    const supabase = mockSupabaseReturning({
      onboarding_completed_at: 'x',
      grandfathered_at: null,
      phone_confirmed_at: null,
    });
    const { req, res, next, mockRes } = buildReqRes(supabase);
    await requireOnboardingIncomplete(req, res, next);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
