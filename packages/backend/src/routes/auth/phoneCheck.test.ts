import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_RATE_LIMITED = 429;

const USER_PER_MIN_MAX = 5;

interface AuthUserRow {
  phone: string;
}

interface MaybeSingleResult {
  data: AuthUserRow | null;
  error: null;
}

interface NotChain {
  maybeSingle: () => Promise<MaybeSingleResult>;
}

interface EqLeaf {
  eq: (col: string, val: string) => EqLeaf;
  not: (col: string, filter: string, val: unknown) => NotChain;
}

interface EqChain {
  eq: (col: string, val: string) => EqLeaf;
  not: (col: string, filter: string, val: unknown) => NotChain;
}

interface SelectChain {
  eq: (col: string, val: string) => EqChain;
}

interface MockFromResult {
  select: (cols: string) => SelectChain;
}

interface MockSchema {
  from: (table: string) => MockFromResult;
}

interface MockService {
  schema: (name: string) => MockSchema;
}

const mockMaybySingle = jest
  .fn<() => Promise<MaybeSingleResult>>()
  .mockResolvedValue({ data: null, error: null });

const notChain: NotChain = { maybeSingle: mockMaybySingle };

const mockNot = jest.fn<(col: string, filter: string, val: unknown) => NotChain>().mockReturnValue(notChain);

const eqLeaf: EqLeaf = {
  eq: jest.fn<(col: string, val: string) => EqLeaf>(),
  not: mockNot,
};

const eqChain: EqChain = {
  eq: jest.fn<(col: string, val: string) => EqLeaf>().mockReturnValue(eqLeaf),
  not: mockNot,
};

const selectChain: SelectChain = {
  eq: jest.fn<(col: string, val: string) => EqChain>().mockReturnValue(eqChain),
};

const mockFrom = jest.fn<(table: string) => MockFromResult>().mockReturnValue({
  select: jest.fn<(cols: string) => SelectChain>().mockReturnValue(selectChain),
});

const mockSchema = jest.fn<(name: string) => MockSchema>().mockReturnValue({ from: mockFrom });

jest.unstable_mockModule('../../db/client.js', () => ({
  serviceSupabase: jest.fn<() => MockService>(() => ({ schema: mockSchema })),
}));

jest.unstable_mockModule('../../lib/auditLog.js', () => ({ auditLog: jest.fn() }));

const { phoneCheckRouter } = await import('./phoneCheck.js');

const PHONE = '+12025550100';
const USER_ID = 'user-abc';

function makeApp(userId = USER_ID): express.Express {
  const app = express().use(express.json());
  app.use((req, res, next) => {
    Object.assign(res.locals, { userId });
    next();
  });
  app.use('/auth/phone', phoneCheckRouter());
  return app;
}

function mockAvailable(): void {
  mockMaybySingle.mockResolvedValueOnce({ data: null, error: null });
}

function mockTaken(): void {
  mockMaybySingle.mockResolvedValueOnce({ data: { phone: PHONE }, error: null });
}

describe('POST /auth/phone/check — validation', () => {
  it('invalid phone format returns 400', async () => {
    const res = await request(makeApp()).post('/auth/phone/check').send({ phone: 'not-a-phone' });
    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(res.body).toEqual({ error: 'invalid_format' });
  });

  it('unsupported country returns 400', async () => {
    const res = await request(makeApp()).post('/auth/phone/check').send({ phone: '+5511999999999' });
    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(res.body).toEqual({ error: 'country_not_supported' });
  });
});

describe('POST /auth/phone/check — availability', () => {
  it('available phone returns {available: true}', async () => {
    mockAvailable();
    const res = await request(makeApp()).post('/auth/phone/check').send({ phone: PHONE });
    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ available: true });
  });

  it('taken phone returns {available: false}', async () => {
    mockTaken();
    const res = await request(makeApp()).post('/auth/phone/check').send({ phone: PHONE });
    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ available: false });
  });
});

async function exhaustPerUserBudget(app: express.Express): Promise<void> {
  Array.from({ length: USER_PER_MIN_MAX }).forEach(() => {
    mockAvailable();
  });
  const requests = Array.from({ length: USER_PER_MIN_MAX }, () =>
    request(app).post('/auth/phone/check').send({ phone: PHONE })
  );
  const results = await Promise.all(requests);
  results.forEach((r) => {
    expect(r.status).toBe(HTTP_OK);
  });
}

describe('POST /auth/phone/check — rate limiting', () => {
  it('rate-limits after exhausting per-user per-minute budget', async () => {
    const uniqueUser = 'user-rate-test';
    const app = makeApp(uniqueUser);
    await exhaustPerUserBudget(app);
    const res = await request(app).post('/auth/phone/check').send({ phone: PHONE });
    expect(res.status).toBe(HTTP_RATE_LIMITED);
    expect(res.body).toEqual({ error: 'rate_limited' });
  });
});
