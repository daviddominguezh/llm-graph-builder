import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const HTTP_OK = 200;
const HTTP_CONFLICT = 409;

const IP_RECLAIM_SUCCESS = '2.2.2.1';
const IP_RECLAIM_NONE = '2.2.2.2';
const IP_RECLAIM_RETRY_FAIL = '2.2.2.3';

interface OtpAttemptsRow {
  resends_24h: number;
  resends_window_start: string;
}

interface MaybeSingleResult {
  data: { next_allowed_at: string } | OtpAttemptsRow | null;
  error: null;
}

type GoTrueUpdateResult = { ok: true } | { ok: false; error: string };

interface EqChain {
  eq: (col: string, val: string) => EqChain;
  maybeSingle: () => Promise<MaybeSingleResult>;
}

interface MockFromResult {
  select: (cols: string) => EqChain;
  upsert: (vals: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<{ error: null }>;
}

interface MockRpcResult {
  data: boolean | null;
}

interface MockService {
  from: (table: string) => MockFromResult;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<MockRpcResult>;
}

const mockGoTrueUpdate = jest.fn<() => Promise<GoTrueUpdateResult>>();
const mockRpc = jest
  .fn<(fn: string, args: Record<string, unknown>) => Promise<MockRpcResult>>()
  .mockResolvedValue({ data: false });
const mockMaybeSingle = jest
  .fn<() => Promise<MaybeSingleResult>>()
  .mockResolvedValue({ data: null, error: null });
const mockUpsert = jest
  .fn<(v: Record<string, unknown>, o?: Record<string, unknown>) => Promise<{ error: null }>>()
  .mockResolvedValue({ error: null });

const leafEqChain: EqChain = {
  eq: jest.fn<(col: string, val: string) => EqChain>(),
  maybeSingle: mockMaybeSingle,
};
const innerEqChain: EqChain = {
  eq: jest.fn<(col: string, val: string) => EqChain>().mockReturnValue(leafEqChain),
  maybeSingle: mockMaybeSingle,
};

const mockFrom = jest.fn<(table: string) => MockFromResult>().mockReturnValue({
  select: jest.fn<(cols: string) => EqChain>().mockReturnValue({
    eq: jest.fn<(col: string, val: string) => EqChain>().mockReturnValue(innerEqChain),
    maybeSingle: mockMaybeSingle,
  }),
  upsert: mockUpsert,
});

jest.unstable_mockModule('../../db/client.js', () => ({
  serviceSupabase: jest.fn<() => MockService>(() => ({ from: mockFrom, rpc: mockRpc })),
}));
jest.unstable_mockModule('../../lib/auditLog.js', () => ({ auditLog: jest.fn() }));
jest.unstable_mockModule('../../lib/phoneValidation.js', () => ({
  validatePhone: jest.fn().mockReturnValue({ ok: true, e164: '+12025550100' }),
}));
jest.unstable_mockModule('../../lib/gotrue.js', () => ({
  goTrueUpdateUserPhone: mockGoTrueUpdate,
}));
function passGate(_req: unknown, _res: unknown, next: () => void): void {
  next();
}
jest.unstable_mockModule('../../middleware/gates.js', () => ({
  requireOnboardingIncomplete: passGate,
  requireGateComplete: passGate,
  requirePhoneUnverified: passGate,
}));

const { phoneSendOtpRouter } = await import('./phoneSendOtp.js');

const PHONE = '+12025550100';
const USER_ID = 'user-reclaim';
const WINDOW_RECENT_MS = 1_000;
const RESEND_COUNT_ONE = 1;
const PHONE_TAKEN = 'A user with this phone has already been registered';

function makeApp(fakeIp: string): express.Express {
  const app = express().use(express.json());
  app.use((req, res, next) => {
    Object.assign(res.locals, { userId: USER_ID, jwt: 'test-jwt' });
    Object.defineProperty(req, 'ip', { get: () => fakeIp });
    next();
  });
  app.use('/auth/phone', phoneSendOtpRouter());
  return app;
}

function mockPreChecksPass(): void {
  mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
  const windowStart = new Date(Date.now() - WINDOW_RECENT_MS).toISOString();
  mockMaybeSingle.mockResolvedValueOnce({
    data: { resends_24h: RESEND_COUNT_ONE, resends_window_start: windowStart },
    error: null,
  });
}

describe('POST /auth/phone/send-otp — phone_taken lazy reclaim', () => {
  it('reclaims a stale hold and succeeds on retry', async () => {
    mockPreChecksPass();
    mockGoTrueUpdate.mockResolvedValueOnce({ ok: false, error: PHONE_TAKEN });
    mockRpc.mockResolvedValueOnce({ data: true });
    mockGoTrueUpdate.mockResolvedValueOnce({ ok: true });

    const res = await request(makeApp(IP_RECLAIM_SUCCESS))
      .post('/auth/phone/send-otp')
      .send({ phone: PHONE });

    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toMatchObject({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith(
      'reclaim_stale_phone',
      expect.objectContaining({ p_phone: PHONE, p_user_id: USER_ID })
    );
  });

  it('returns 409 when nothing to reclaim', async () => {
    mockPreChecksPass();
    mockGoTrueUpdate.mockResolvedValueOnce({ ok: false, error: PHONE_TAKEN });
    mockRpc.mockResolvedValueOnce({ data: false });

    const res = await request(makeApp(IP_RECLAIM_NONE)).post('/auth/phone/send-otp').send({ phone: PHONE });

    expect(res.status).toBe(HTTP_CONFLICT);
    expect(res.body).toEqual({ error: 'phone_taken' });
  });

  it('returns 409 when reclaim succeeds but retry still fails', async () => {
    mockPreChecksPass();
    mockGoTrueUpdate.mockResolvedValueOnce({ ok: false, error: PHONE_TAKEN });
    mockRpc.mockResolvedValueOnce({ data: true });
    mockGoTrueUpdate.mockResolvedValueOnce({ ok: false, error: 'duplicate phone' });

    const res = await request(makeApp(IP_RECLAIM_RETRY_FAIL))
      .post('/auth/phone/send-otp')
      .send({ phone: PHONE });

    expect(res.status).toBe(HTTP_CONFLICT);
    expect(res.body).toEqual({ error: 'phone_taken' });
  });
});
