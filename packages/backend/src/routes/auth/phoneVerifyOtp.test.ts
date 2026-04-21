import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_RATE_LIMITED = 429;
const EXPECTED_FAILS_ONE = 1;
const EXPECTED_FAILS_FIVE = 5;
const LOCK_MINUTES = 15;
const MS_PER_MINUTE = 60_000;
const LOCK_MS = LOCK_MINUTES * MS_PER_MINUTE;

interface OtpAttemptRow {
  locked_until: string | null;
}

interface MaybeSingleResult {
  data: OtpAttemptRow | null;
  error: null;
}

interface RpcResult {
  data: number;
  error: null;
}

interface SessionData {
  access_token: string;
  refresh_token: string;
  user: { id: string };
}

interface VerifyOtpResult {
  data: { session: SessionData | null };
  error: { message: string } | null;
}

interface EqMaybySingle {
  eq: (col: string, val: string) => EqMaybySingle;
  maybeSingle: () => Promise<MaybeSingleResult>;
}

interface EqUpdateChain {
  eq: (col: string, val: string) => EqUpdateChain;
}

interface MockFromResult {
  select: (cols: string) => EqMaybySingle;
  update: (vals: Record<string, unknown>) => EqUpdateChain;
}

interface MockService {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  from: (table: string) => MockFromResult;
}

const mockVerifyOtp = jest.fn<() => Promise<VerifyOtpResult>>();
const mockRpc = jest.fn<() => Promise<RpcResult>>().mockResolvedValue({ data: EXPECTED_FAILS_ONE, error: null });
const mockMaybySingle = jest
  .fn<() => Promise<MaybeSingleResult>>()
  .mockResolvedValue({ data: null, error: null });

const mockFrom = jest.fn<(table: string) => MockFromResult>().mockReturnValue({
  select: jest
    .fn<(cols: string) => EqMaybySingle>()
    .mockReturnValue({
      eq: jest.fn<(col: string, val: string) => EqMaybySingle>().mockReturnValue({
        eq: jest.fn<(col: string, val: string) => EqMaybySingle>().mockReturnValue({
          eq: jest.fn<(col: string, val: string) => EqMaybySingle>().mockReturnValue({
            eq: jest.fn(),
            maybeSingle: mockMaybySingle,
          }),
          maybeSingle: mockMaybySingle,
        }),
        maybeSingle: mockMaybySingle,
      }),
      maybeSingle: mockMaybySingle,
    }),
  update: jest
    .fn<(vals: Record<string, unknown>) => EqUpdateChain>()
    .mockReturnValue({ eq: jest.fn<(col: string, val: string) => EqUpdateChain>().mockReturnValue({ eq: jest.fn() }) }),
});

jest.unstable_mockModule('../../db/client.js', () => ({
  serviceSupabase: jest.fn<() => MockService>(() => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}));
jest.unstable_mockModule('../../lib/auditLog.js', () => ({ auditLog: jest.fn() }));
jest.unstable_mockModule('../../lib/phoneValidation.js', () => ({
  validatePhone: jest
    .fn<(raw: string) => { ok: false; error: string } | { ok: true; e164: string }>()
    .mockReturnValue({ ok: true, e164: '+12025550100' }),
}));

const { phoneVerifyOtpRouter } = await import('./phoneVerifyOtp.js');
const { auditLog } = await import('../../lib/auditLog.js');

const GOOD_TOKEN = '123456';
const PHONE = '+12025550100';
const USER_ID = 'user-abc';
const ACCESS_TOKEN = 'access-tok';
const REFRESH_TOKEN = 'refresh-tok';

function buildUserLocals(userId: string): Record<string, unknown> {
  return { userId, supabase: { auth: { verifyOtp: mockVerifyOtp } } };
}

function makeApp(userId = USER_ID): express.Express {
  const app = express().use(express.json());
  app.use((req, res, next) => {
    Object.assign(res.locals, buildUserLocals(userId));
    next();
  });
  app.use('/auth/phone', phoneVerifyOtpRouter());
  return app;
}

function mockNotLocked(): void {
  mockMaybySingle.mockResolvedValueOnce({ data: null, error: null });
}

function mockLocked(): void {
  const future = new Date(Date.now() + LOCK_MS).toISOString();
  mockMaybySingle.mockResolvedValueOnce({ data: { locked_until: future }, error: null });
}

function goodSession(userId: string): VerifyOtpResult {
  return {
    data: { session: { access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN, user: { id: userId } } },
    error: null,
  };
}

const badOtpResult: VerifyOtpResult = { data: { session: null }, error: { message: 'Token has expired' } };

describe('POST /auth/phone/verify-otp — success', () => {
  it('happy path: good code returns tokens', async () => {
    mockNotLocked();
    mockVerifyOtp.mockResolvedValueOnce(goodSession(USER_ID));

    const res = await request(makeApp()).post('/auth/phone/verify-otp').send({ phone: PHONE, token: GOOD_TOKEN });

    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN });
  });

  it('sub mismatch: returns 400 sub_mismatch', async () => {
    mockNotLocked();
    mockVerifyOtp.mockResolvedValueOnce(goodSession('different-user-id'));

    const res = await request(makeApp()).post('/auth/phone/verify-otp').send({ phone: PHONE, token: GOOD_TOKEN });

    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(res.body).toEqual({ error: 'sub_mismatch' });
  });
});

describe('POST /auth/phone/verify-otp — failures', () => {
  it('bad code: returns 400 invalid_otp and increments fails', async () => {
    mockNotLocked();
    mockVerifyOtp.mockResolvedValueOnce(badOtpResult);
    mockRpc.mockResolvedValueOnce({ data: EXPECTED_FAILS_ONE, error: null });

    const res = await request(makeApp()).post('/auth/phone/verify-otp').send({ phone: PHONE, token: GOOD_TOKEN });

    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(res.body).toEqual({ error: 'invalid_otp' });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ event: 'otp_verify_failed' }));
  });

  it('5th bad code: audits otp_lockout', async () => {
    mockNotLocked();
    mockVerifyOtp.mockResolvedValueOnce(badOtpResult);
    mockRpc.mockResolvedValueOnce({ data: EXPECTED_FAILS_FIVE, error: null });

    const res = await request(makeApp()).post('/auth/phone/verify-otp').send({ phone: PHONE, token: GOOD_TOKEN });

    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ event: 'otp_lockout' }));
  });

  it('after lockout expires + one bad code: fails drops to 1', async () => {
    mockNotLocked();
    mockVerifyOtp.mockResolvedValueOnce(badOtpResult);
    mockRpc.mockResolvedValueOnce({ data: EXPECTED_FAILS_ONE, error: null });

    const res = await request(makeApp()).post('/auth/phone/verify-otp').send({ phone: PHONE, token: GOOD_TOKEN });

    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'otp_verify_failed', metadata: { fails: EXPECTED_FAILS_ONE } })
    );
  });
});

describe('POST /auth/phone/verify-otp — lockout', () => {
  it('locked state: returns 429 otp_locked', async () => {
    mockLocked();

    const res = await request(makeApp()).post('/auth/phone/verify-otp').send({ phone: PHONE, token: GOOD_TOKEN });

    expect(res.status).toBe(HTTP_RATE_LIMITED);
    expect(res.body).toEqual({ error: 'otp_locked' });
  });
});
