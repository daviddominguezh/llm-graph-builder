import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_RATE_LIMITED = 429;
const HTTP_INTERNAL = 500;
const COOLDOWN_FUTURE_MS = 120_000;
const RESEND_LIMIT_EXCEEDED = 11;
const WINDOW_RECENT_MS = 1_000;
const RESEND_COUNT_ONE = 1;
const IP_LIMIT_MAX = 3;

// Unique test IPs — each test gets a fresh bucket in the per-IP rate limiter
const IP_COOLDOWN_ACTIVE = '1.1.1.1';
const IP_COOLDOWN_EXPIRED = '1.1.1.2';
const IP_RESEND_OVER_LIMIT = '1.1.1.3';
const IP_INVALID_PHONE = '1.1.1.4';
const IP_RATE_LIMIT = '1.1.1.5';
const IP_UPDATE_USER_ERROR = '1.1.1.6';

interface CooldownRow {
  next_allowed_at: string;
}

interface OtpAttemptsRow {
  resends_24h: number;
  resends_window_start: string;
}

interface MaybeSingleCooldownResult {
  data: CooldownRow | null;
  error: null;
}

interface MaybySingleAttemptsResult {
  data: OtpAttemptsRow | null;
  error: null;
}

type GoTrueUpdateResult = { ok: true } | { ok: false; error: string };

interface EqChain {
  eq: (col: string, val: string) => EqChain;
  maybeSingle: () => Promise<MaybeSingleCooldownResult | MaybySingleAttemptsResult>;
}

interface MockFromResult {
  select: (cols: string) => EqChain;
  upsert: (vals: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<{ error: null }>;
}

interface MockService {
  from: jest.MockedFunction<(table: string) => MockFromResult>;
  auth?: never;
}

type PhoneValidationResult = { ok: false; error: string } | { ok: true; e164: string };

const mockValidatePhone = jest
  .fn<(raw: string) => PhoneValidationResult>()
  .mockReturnValue({ ok: true, e164: '+12025550100' });

const mockGoTrueUpdate = jest.fn<() => Promise<GoTrueUpdateResult>>();

const mockMaybySingle = jest
  .fn<() => Promise<MaybeSingleCooldownResult | MaybySingleAttemptsResult>>()
  .mockResolvedValue({ data: null, error: null });

const mockUpsert = jest
  .fn<(v: Record<string, unknown>, o?: Record<string, unknown>) => Promise<{ error: null }>>()
  .mockResolvedValue({ error: null });

const leafEqChain: EqChain = {
  eq: jest.fn<(col: string, val: string) => EqChain>(),
  maybeSingle: mockMaybySingle,
};
const innerEqChain: EqChain = {
  eq: jest.fn<(col: string, val: string) => EqChain>().mockReturnValue(leafEqChain),
  maybeSingle: mockMaybySingle,
};

const mockFrom = jest.fn<(table: string) => MockFromResult>().mockReturnValue({
  select: jest.fn<(cols: string) => EqChain>().mockReturnValue({
    eq: jest.fn<(col: string, val: string) => EqChain>().mockReturnValue(innerEqChain),
    maybeSingle: mockMaybySingle,
  }),
  upsert: mockUpsert,
});

jest.unstable_mockModule('../../db/client.js', () => ({
  serviceSupabase: jest.fn<() => MockService>(() => ({ from: mockFrom })),
}));
jest.unstable_mockModule('../../lib/auditLog.js', () => ({ auditLog: jest.fn() }));
jest.unstable_mockModule('../../lib/phoneValidation.js', () => ({
  validatePhone: mockValidatePhone,
}));
jest.unstable_mockModule('../../lib/gotrue.js', () => ({
  goTrueUpdateUserPhone: mockGoTrueUpdate,
}));

const { phoneSendOtpRouter } = await import('./phoneSendOtp.js');
const { auditLog } = await import('../../lib/auditLog.js');

const PHONE = '+12025550100';
const USER_ID = 'user-abc';

function buildLocals(userId: string): Record<string, unknown> {
  return { userId, jwt: 'test-jwt' };
}

function makeApp(userId = USER_ID, fakeIp?: string): express.Express {
  const app = express().use(express.json());
  app.use((req, res, next) => {
    Object.assign(res.locals, buildLocals(userId));
    if (fakeIp !== undefined) {
      Object.defineProperty(req, 'ip', { get: () => fakeIp });
    }
    next();
  });
  app.use('/auth/phone', phoneSendOtpRouter());
  return app;
}

function mockNoCooldown(): void {
  mockMaybySingle.mockResolvedValueOnce({ data: null, error: null });
}

function mockActiveCooldown(): void {
  const future = new Date(Date.now() + COOLDOWN_FUTURE_MS).toISOString();
  mockMaybySingle.mockResolvedValueOnce({ data: { next_allowed_at: future }, error: null });
}

function mockResendWindow(resends: number): void {
  const windowStart = new Date(Date.now() - WINDOW_RECENT_MS).toISOString();
  mockMaybySingle.mockResolvedValueOnce({
    data: { resends_24h: resends, resends_window_start: windowStart },
    error: null,
  });
}

describe('POST /auth/phone/send-otp — cooldown', () => {
  it('active cooldown returns 429 with cooldownUntil', async () => {
    mockActiveCooldown();

    const res = await request(makeApp(USER_ID, IP_COOLDOWN_ACTIVE))
      .post('/auth/phone/send-otp')
      .send({ phone: PHONE });

    expect(res.status).toBe(HTTP_RATE_LIMITED);
    expect(res.body).toMatchObject({ error: 'cooldown', cooldownUntil: expect.any(String) });
  });

  it('expired cooldown proceeds and returns 200 with new cooldownUntil', async () => {
    mockNoCooldown();
    mockResendWindow(RESEND_COUNT_ONE);
    mockGoTrueUpdate.mockResolvedValueOnce({ ok: true });

    const res = await request(makeApp(USER_ID, IP_COOLDOWN_EXPIRED))
      .post('/auth/phone/send-otp')
      .send({ phone: PHONE });

    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toMatchObject({ ok: true, cooldownUntil: expect.any(String) });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ event: 'phone_send_otp' }));
  });
});

describe('POST /auth/phone/send-otp — resend window', () => {
  it('resends_24h > 10 returns 429 otp_rate_limited_24h', async () => {
    mockNoCooldown();
    mockResendWindow(RESEND_LIMIT_EXCEEDED);

    const res = await request(makeApp(USER_ID, IP_RESEND_OVER_LIMIT))
      .post('/auth/phone/send-otp')
      .send({ phone: PHONE });

    expect(res.status).toBe(HTTP_RATE_LIMITED);
    expect(res.body).toEqual({ error: 'otp_rate_limited_24h' });
  });
});

describe('POST /auth/phone/send-otp — validation', () => {
  it('invalid phone returns 400', async () => {
    mockValidatePhone.mockReturnValueOnce({ ok: false, error: 'invalid_format' });

    const res = await request(makeApp(USER_ID, IP_INVALID_PHONE))
      .post('/auth/phone/send-otp')
      .send({ phone: 'not-a-phone' });

    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(res.body).toMatchObject({ error: 'invalid_format' });
  });
});

describe('POST /auth/phone/send-otp — rate limit', () => {
  it('per-IP limit hit returns 429', async () => {
    const app = makeApp(USER_ID, IP_RATE_LIMIT);
    const sendRequests = Array.from({ length: IP_LIMIT_MAX }, async () => {
      mockNoCooldown();
      mockResendWindow(RESEND_COUNT_ONE);
      mockGoTrueUpdate.mockResolvedValueOnce({ ok: true });
      return await request(app).post('/auth/phone/send-otp').send({ phone: PHONE });
    });
    await Promise.all(sendRequests);

    const res = await request(app).post('/auth/phone/send-otp').send({ phone: PHONE });

    expect(res.status).toBe(HTTP_RATE_LIMITED);
    expect(res.body).toEqual({ error: 'rate_limited' });
  });
});

describe('POST /auth/phone/send-otp — updateUser error', () => {
  it('updateUser error returns 500', async () => {
    mockNoCooldown();
    mockResendWindow(RESEND_COUNT_ONE);
    mockGoTrueUpdate.mockResolvedValueOnce({ ok: false, error: 'SMS failed' });

    const res = await request(makeApp(USER_ID, IP_UPDATE_USER_ERROR))
      .post('/auth/phone/send-otp')
      .send({ phone: PHONE });

    expect(res.status).toBe(HTTP_INTERNAL);
    expect(res.body).toEqual({ error: 'send_failed', detail: 'SMS failed' });
  });
});
