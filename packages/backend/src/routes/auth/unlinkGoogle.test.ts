import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL = 500;

const USER_ID = 'user-abc';

interface MockIdentity {
  id: string;
  identity_id: string;
  user_id: string;
  provider: string;
}

interface MockUser {
  id: string;
  identities: MockIdentity[];
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  aud: string;
  created_at: string;
}

interface GetUserResult {
  data: { user: MockUser };
  error: null;
}

interface GetUserError {
  data: { user: null };
  error: { message: string };
}

type GetUserResponse = GetUserResult | GetUserError;

interface DeleteResult {
  error: { message: string } | null;
}

const GOOGLE_IDENTITY: MockIdentity = {
  id: 'id-google',
  identity_id: 'iid-google',
  user_id: USER_ID,
  provider: 'google',
};

const EMAIL_IDENTITY: MockIdentity = {
  id: 'id-email',
  identity_id: 'iid-email',
  user_id: USER_ID,
  provider: 'email',
};

function makeUser(identities: MockIdentity[]): MockUser {
  return {
    id: USER_ID,
    identities,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2024-01-01T00:00:00Z',
  };
}

const mockGetUserById = jest
  .fn<() => Promise<GetUserResponse>>()
  .mockResolvedValue({ data: { user: makeUser([GOOGLE_IDENTITY, EMAIL_IDENTITY]) }, error: null });

const mockDeleteEqFinal = jest.fn<() => Promise<DeleteResult>>().mockResolvedValue({ error: null });

const mockDeleteEqChain = jest.fn<() => { eq: typeof mockDeleteEqFinal }>().mockReturnValue({
  eq: mockDeleteEqFinal,
});

const mockDeleteFn = jest.fn<() => { eq: typeof mockDeleteEqChain }>().mockReturnValue({
  eq: mockDeleteEqChain,
});

const mockFrom = jest.fn<() => { delete: typeof mockDeleteFn }>().mockReturnValue({
  delete: mockDeleteFn,
});

const mockSchema = jest.fn<() => { from: typeof mockFrom }>().mockReturnValue({
  from: mockFrom,
});

interface AuditEntry {
  event: string;
  userId?: string;
}

const mockAuditLog = jest.fn<(entry: AuditEntry) => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../db/client.js', () => ({
  serviceSupabase: jest.fn(() => ({
    auth: { admin: { getUserById: mockGetUserById } },
    schema: mockSchema,
  })),
}));

jest.unstable_mockModule('../../lib/auditLog.js', () => ({ auditLog: mockAuditLog }));

const { unlinkGoogleRouter } = await import('./unlinkGoogle.js');

function makeApp(userId = USER_ID): express.Express {
  const app = express().use(express.json());
  app.use((req, res, next) => {
    Object.assign(res.locals, { userId });
    next();
  });
  app.use('/auth', unlinkGoogleRouter());
  return app;
}

describe('POST /auth/unlink-google — happy path', () => {
  it('returns 200 { ok: true } when user has email + google identities', async () => {
    mockGetUserById.mockResolvedValueOnce({
      data: { user: makeUser([GOOGLE_IDENTITY, EMAIL_IDENTITY]) },
      error: null,
    });
    mockDeleteEqFinal.mockResolvedValueOnce({ error: null });

    const res = await request(makeApp()).post('/auth/unlink-google');

    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('POST /auth/unlink-google — audit on success', () => {
  it('writes google_unlinked audit entry on success', async () => {
    mockGetUserById.mockResolvedValueOnce({
      data: { user: makeUser([GOOGLE_IDENTITY, EMAIL_IDENTITY]) },
      error: null,
    });
    mockDeleteEqFinal.mockResolvedValueOnce({ error: null });

    await request(makeApp()).post('/auth/unlink-google');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'google_unlinked', userId: USER_ID })
    );
  });
});

describe('POST /auth/unlink-google — only google identity', () => {
  it('returns 400 cannot_unlink_only_identity when email identity is absent', async () => {
    mockGetUserById.mockResolvedValueOnce({
      data: { user: makeUser([GOOGLE_IDENTITY]) },
      error: null,
    });

    const res = await request(makeApp()).post('/auth/unlink-google');

    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(res.body).toEqual({ error: 'cannot_unlink_only_identity' });
  });
});

describe('POST /auth/unlink-google — no google identity', () => {
  it('returns 400 no_google_identity when user has no google identity', async () => {
    mockGetUserById.mockResolvedValueOnce({
      data: { user: makeUser([EMAIL_IDENTITY]) },
      error: null,
    });

    const res = await request(makeApp()).post('/auth/unlink-google');

    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(res.body).toEqual({ error: 'no_google_identity' });
  });
});

describe('POST /auth/unlink-google — delete error', () => {
  it('returns 500 unlink_failed when delete fails', async () => {
    mockGetUserById.mockResolvedValueOnce({
      data: { user: makeUser([GOOGLE_IDENTITY, EMAIL_IDENTITY]) },
      error: null,
    });
    mockDeleteEqFinal.mockResolvedValueOnce({ error: { message: 'DB error' } });

    const res = await request(makeApp()).post('/auth/unlink-google');

    expect(res.status).toBe(HTTP_INTERNAL);
    expect(res.body).toEqual({ error: 'unlink_failed' });
  });
});
