import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';

interface LimitBuilder {
  limit: (n: number) => Promise<{ error: { message: string } | null }>;
}

interface SelectBuilder {
  select: (cols: string) => LimitBuilder;
}

interface MockServiceClient {
  from: jest.Mock<(table: string) => SelectBuilder>;
}

const TRUST_ONE_PROXY = 1;
const SHORT_SECRET = 'too-short';
const SECRET_BYTE_LENGTH = 32;
const VALID_SECRET = 'a'.repeat(SECRET_BYTE_LENGTH);
const TABLE_ERROR = 'relation does not exist';

function makeLimitBuilder(error: { message: string } | null): LimitBuilder {
  return {
    limit: jest
      .fn<(n: number) => Promise<{ error: { message: string } | null }>>()
      .mockResolvedValue({ error }),
  };
}

function makeSelectBuilder(error: { message: string } | null): SelectBuilder {
  return { select: jest.fn<(cols: string) => LimitBuilder>().mockReturnValue(makeLimitBuilder(error)) };
}

const mockFrom = jest.fn<(table: string) => SelectBuilder>();
const mockServiceSupabase = jest.fn<() => MockServiceClient>(() => ({ from: mockFrom }));

jest.unstable_mockModule('../db/client.js', () => ({
  serviceSupabase: mockServiceSupabase,
}));

const { runStartupChecks } = await import('./startupChecks.js');

function buildApp(): express.Express {
  const app = express();
  app.set('trust proxy', TRUST_ONE_PROXY);
  return app;
}

function setValidSecrets(): void {
  process.env.SUPABASE_SERVICE_ROLE_KEY = VALID_SECRET;
  process.env.RATE_LIMIT_BUCKET_SECRET = VALID_SECRET;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.RATE_LIMIT_BUCKET_SECRET;
  mockFrom.mockImplementation(() => makeSelectBuilder(null));
});

describe('runStartupChecks - missing secret', () => {
  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    const app = buildApp();
    await expect(runStartupChecks(app)).rejects.toThrow('SUPABASE_SERVICE_ROLE_KEY is required');
  });

  it('throws when RATE_LIMIT_BUCKET_SECRET is missing', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = VALID_SECRET;
    const app = buildApp();
    await expect(runStartupChecks(app)).rejects.toThrow('RATE_LIMIT_BUCKET_SECRET is required');
  });
});

describe('runStartupChecks - short secret', () => {
  it('throws when SUPABASE_SERVICE_ROLE_KEY is too short', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SHORT_SECRET;
    process.env.RATE_LIMIT_BUCKET_SECRET = VALID_SECRET;
    const app = buildApp();
    await expect(runStartupChecks(app)).rejects.toThrow('SUPABASE_SERVICE_ROLE_KEY must be >= 32 bytes');
  });

  it('throws when RATE_LIMIT_BUCKET_SECRET is too short', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = VALID_SECRET;
    process.env.RATE_LIMIT_BUCKET_SECRET = SHORT_SECRET;
    const app = buildApp();
    await expect(runStartupChecks(app)).rejects.toThrow('RATE_LIMIT_BUCKET_SECRET must be >= 32 bytes');
  });
});

describe('runStartupChecks - table missing', () => {
  it('throws when a required table is not reachable', async () => {
    setValidSecrets();
    mockFrom.mockImplementationOnce(() => makeSelectBuilder({ message: TABLE_ERROR }));
    const app = buildApp();
    await expect(runStartupChecks(app)).rejects.toThrow(TABLE_ERROR);
  });
});

describe('runStartupChecks - happy path', () => {
  it('resolves when all checks pass', async () => {
    setValidSecrets();
    const app = buildApp();
    await expect(runStartupChecks(app)).resolves.toBeUndefined();
  });
});
