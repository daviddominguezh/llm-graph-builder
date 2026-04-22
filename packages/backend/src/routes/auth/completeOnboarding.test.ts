import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL = 500;
const PG_UNIQUE_VIOLATION = '23505';

interface MutationResult {
  error: { code: string; message: string } | null;
}

interface InsertChain {
  insert: (row: Record<string, unknown>) => Promise<MutationResult>;
}

interface UpdateEqChain {
  eq: (col: string, val: string) => Promise<MutationResult>;
}

interface UpdateChain {
  update: (vals: Record<string, unknown>) => UpdateEqChain;
}

type FromResult = InsertChain | UpdateChain;

const mockInsert = jest.fn<() => Promise<MutationResult>>().mockResolvedValue({ error: null });
const mockUpdateEq = jest.fn<() => Promise<MutationResult>>().mockResolvedValue({ error: null });
const mockUpdate = jest.fn<(vals: Record<string, unknown>) => UpdateEqChain>().mockReturnValue({
  eq: mockUpdateEq,
});

const mockFrom = jest.fn<(table: string) => FromResult>().mockImplementation((table) => {
  if (table === 'user_onboarding') return { insert: mockInsert };
  return { update: mockUpdate };
});

jest.unstable_mockModule('../../lib/auditLog.js', () => ({ auditLog: jest.fn() }));

const { completeOnboardingRouter } = await import('./completeOnboarding.js');
const { auditLog } = await import('../../lib/auditLog.js');

const USER_ID = 'user-xyz';

const VALID_BODY = {
  industry: 'it_software',
  company_size: '2-10',
  role: 'developer',
  referral_sources: ['linkedin'],
  build_goals: ['ai_agents'],
};

function buildLocals(userId: string): Record<string, unknown> {
  return { userId, supabase: { from: mockFrom } };
}

function makeApp(userId = USER_ID): express.Express {
  const app = express().use(express.json());
  app.use((req, res, next) => {
    Object.assign(res.locals, buildLocals(userId));
    next();
  });
  app.use('/auth', completeOnboardingRouter());
  return app;
}

describe('POST /auth/complete-onboarding — success', () => {
  it('happy path returns 200 { ok: true } and audits onboarding_completed', async () => {
    mockInsert.mockResolvedValueOnce({ error: null });
    mockUpdateEq.mockResolvedValueOnce({ error: null });

    const res = await request(makeApp()).post('/auth/complete-onboarding').send(VALID_BODY);

    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ ok: true });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ event: 'onboarding_completed' }));
  });
});

describe('POST /auth/complete-onboarding — validation errors', () => {
  it('missing required fields returns 400 invalid_body', async () => {
    const res = await request(makeApp()).post('/auth/complete-onboarding').send({ company_size: '2-10' });

    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(res.body).toMatchObject({ error: 'invalid_body' });
    expect(res.body).toHaveProperty('issues');
  });

  it('empty referral_sources array returns 400 invalid_body', async () => {
    const res = await request(makeApp())
      .post('/auth/complete-onboarding')
      .send({ ...VALID_BODY, referral_sources: [] });

    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(res.body).toMatchObject({ error: 'invalid_body' });
  });

  it('unknown enum value returns 400 invalid_body', async () => {
    const res = await request(makeApp())
      .post('/auth/complete-onboarding')
      .send({ ...VALID_BODY, industry: 'not_a_real_industry' });

    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(res.body).toMatchObject({ error: 'invalid_body' });
  });
});

describe('POST /auth/complete-onboarding — DB errors', () => {
  it('duplicate insert (23505) returns 409 already_completed', async () => {
    mockInsert.mockResolvedValueOnce({ error: { code: PG_UNIQUE_VIOLATION, message: 'duplicate key' } });

    const res = await request(makeApp()).post('/auth/complete-onboarding').send(VALID_BODY);

    expect(res.status).toBe(HTTP_CONFLICT);
    expect(res.body).toEqual({ error: 'already_completed' });
  });

  it('update failure returns 500', async () => {
    mockInsert.mockResolvedValueOnce({ error: null });
    mockUpdateEq.mockResolvedValueOnce({ error: { code: 'PGRST000', message: 'update failed' } });

    const res = await request(makeApp()).post('/auth/complete-onboarding').send(VALID_BODY);

    expect(res.status).toBe(HTTP_INTERNAL);
  });
});
