import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createOpenRouterKey } from './managementKeys.js';

const TEST_LIMIT = 1;
const USAGE_ZERO = 0;
const HTTP_OK = 200;
const HTTP_INTERNAL_ERROR = 500;

const OPENROUTER_RESPONSE = {
  data: {
    byok_usage: USAGE_ZERO,
    created_at: '2025-08-24T10:30:00Z',
    creator_user_id: 'user_123',
    disabled: false,
    expires_at: null,
    hash: 'f01d52606dc8f0a8303a7b5cc3fa07109c2e346cec7c0a16b40de462992ce943',
    label: 'sk-or-v1-0e6...1c96',
    limit: TEST_LIMIT,
    limit_remaining: TEST_LIMIT,
    limit_reset: 'monthly',
    name: 'OPENFLOW-KEY-acme',
    updated_at: '2025-08-24T10:30:00Z',
    usage: USAGE_ZERO,
  },
  key: 'sk-or-v1-abc123def456',
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockFetchOnce(response: Response): void {
  global.fetch = jest.fn<typeof fetch>().mockResolvedValue(response);
}

function silenceStdio(): void {
  jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
}

interface EnvSnapshot {
  nodeEnv: string | undefined;
  mgmtKey: string | undefined;
}

function snapshotEnv(): EnvSnapshot {
  return {
    nodeEnv: process.env.NODE_ENV,
    mgmtKey: process.env.OPENROUTER_MANAGEMENT_KEY,
  };
}

function restoreEnv(snapshot: EnvSnapshot): void {
  const { nodeEnv, mgmtKey } = snapshot;
  process.env.NODE_ENV = nodeEnv;
  process.env.OPENROUTER_MANAGEMENT_KEY = mgmtKey;
}

function setProductionEnv(): void {
  process.env.NODE_ENV = 'production';
  process.env.OPENROUTER_MANAGEMENT_KEY = 'test-mgmt-key';
}

describe('createOpenRouterKey — response parsing', () => {
  const original = snapshotEnv();

  beforeEach(() => {
    setProductionEnv();
    silenceStdio();
  });

  afterEach(() => {
    restoreEnv(original);
    jest.restoreAllMocks();
  });

  it('parses real OpenRouter response (key at top level, hash inside data)', async () => {
    mockFetchOnce(jsonResponse(OPENROUTER_RESPONSE, HTTP_OK));
    const result = await createOpenRouterKey('acme');
    expect(result).toEqual({
      key: 'sk-or-v1-abc123def456',
      hash: 'f01d52606dc8f0a8303a7b5cc3fa07109c2e346cec7c0a16b40de462992ce943',
    });
  });

  it('rejects the old (incorrect) shape where key was nested under data', async () => {
    const wrongShape = { data: { key: 'sk-or-v1-xxx', hash: 'h' } };
    mockFetchOnce(jsonResponse(wrongShape, HTTP_OK));
    await expect(createOpenRouterKey('acme')).rejects.toThrow();
  });

  it('throws when OpenRouter returns non-2xx', async () => {
    mockFetchOnce(jsonResponse({ error: 'boom' }, HTTP_INTERNAL_ERROR));
    await expect(createOpenRouterKey('acme')).rejects.toThrow('500');
  });
});

describe('createOpenRouterKey — skip conditions', () => {
  const original = snapshotEnv();

  beforeEach(() => {
    setProductionEnv();
    silenceStdio();
  });

  afterEach(() => {
    restoreEnv(original);
    jest.restoreAllMocks();
  });

  it('returns null in non-production environments', async () => {
    process.env.NODE_ENV = 'development';
    const result = await createOpenRouterKey('acme');
    expect(result).toBeNull();
  });

  it('returns null when OPENROUTER_MANAGEMENT_KEY is missing', async () => {
    delete process.env.OPENROUTER_MANAGEMENT_KEY;
    const result = await createOpenRouterKey('acme');
    expect(result).toBeNull();
  });
});
