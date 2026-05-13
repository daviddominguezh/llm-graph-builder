import { describe, expect, it } from '@jest/globals';

import {
  type CachedMcpSession,
  type SessionCacheRedisLike,
  deleteCachedSessionWithClient,
  mcpSessionKey,
  readCachedSessionWithClient,
  writeCachedSessionWithClient,
} from '../sessionCache.js';

const ORG_ID = 'org-1';
const SERVER_URL = 'https://example.com/mcp';
const ONE_CALL = 1;
const EXPECTED_TTL_SECONDS = 1800;
const SAMPLE_CAPTURED_AT = 1_700_000_000_000;
const MALFORMED_SESSION_ID_VALUE = 42;

const VALID_SESSION: CachedMcpSession = {
  sessionId: 'sess-123',
  serverInfo: { name: 'srv', version: '1.0.0' },
  capturedAt: SAMPLE_CAPTURED_AT,
};

interface FakeRedis extends SessionCacheRedisLike {
  store: Map<string, string>;
  setexCalls: Array<[string, number, string]>;
  delCalls: string[];
  getCallCount: number;
}

const DEL_HIT = 1;
const DEL_MISS = 0;
const GET_INCREMENT = 1;

function createFakeRedis(): FakeRedis {
  const store = new Map<string, string>();
  const setexCalls: Array<[string, number, string]> = [];
  const delCalls: string[] = [];
  let getCallCount = 0;
  const fake: FakeRedis = {
    store,
    setexCalls,
    delCalls,
    get getCallCount() {
      return getCallCount;
    },
    get: async (key: string) => {
      await Promise.resolve();
      getCallCount += GET_INCREMENT;
      return store.get(key) ?? null;
    },
    setex: async (key: string, ttlSeconds: number, value: string) => {
      await Promise.resolve();
      setexCalls.push([key, ttlSeconds, value]);
      store.set(key, value);
      return 'OK';
    },
    del: async (key: string) => {
      await Promise.resolve();
      delCalls.push(key);
      return store.delete(key) ? DEL_HIT : DEL_MISS;
    },
  };
  return fake;
}

describe('mcpSessionKey', () => {
  it('builds the canonical key', () => {
    expect(mcpSessionKey(ORG_ID, 'abc123')).toBe('mcp_session:v1:org-1:abc123');
  });
});

describe('readCachedSessionWithClient', () => {
  it('returns null when client is unavailable', async () => {
    const result = await readCachedSessionWithClient(null, ORG_ID, SERVER_URL);
    expect(result).toBeNull();
  });

  it('returns null when key is missing', async () => {
    const fake = createFakeRedis();
    const result = await readCachedSessionWithClient(fake, ORG_ID, SERVER_URL);
    expect(result).toBeNull();
    expect(fake.getCallCount).toBe(ONE_CALL);
  });

  it('returns null when stored value is malformed JSON', async () => {
    const fake = createFakeRedis();
    await writeCachedSessionWithClient(fake, ORG_ID, SERVER_URL, VALID_SESSION);
    // Corrupt the stored value.
    const [storedKey] = Array.from(fake.store.keys());
    if (storedKey !== undefined) fake.store.set(storedKey, '{not-json');
    const result = await readCachedSessionWithClient(fake, ORG_ID, SERVER_URL);
    expect(result).toBeNull();
  });

  it('returns null when value shape is wrong', async () => {
    const fake = createFakeRedis();
    await writeCachedSessionWithClient(fake, ORG_ID, SERVER_URL, VALID_SESSION);
    const [storedKey] = Array.from(fake.store.keys());
    if (storedKey !== undefined) {
      fake.store.set(storedKey, JSON.stringify({ sessionId: MALFORMED_SESSION_ID_VALUE }));
    }
    const result = await readCachedSessionWithClient(fake, ORG_ID, SERVER_URL);
    expect(result).toBeNull();
  });

  it('returns the parsed session when valid', async () => {
    const fake = createFakeRedis();
    await writeCachedSessionWithClient(fake, ORG_ID, SERVER_URL, VALID_SESSION);
    const result = await readCachedSessionWithClient(fake, ORG_ID, SERVER_URL);
    expect(result).toEqual(VALID_SESSION);
  });
});

describe('writeCachedSessionWithClient', () => {
  it('skips writing when client is unavailable', async () => {
    await expect(
      writeCachedSessionWithClient(null, ORG_ID, SERVER_URL, VALID_SESSION)
    ).resolves.toBeUndefined();
  });

  it('writes serialized session under the canonical key with TTL', async () => {
    const fake = createFakeRedis();
    await writeCachedSessionWithClient(fake, ORG_ID, SERVER_URL, VALID_SESSION);
    const { setexCalls } = fake;
    expect(setexCalls).toHaveLength(ONE_CALL);
    const [first] = setexCalls;
    if (first === undefined) throw new Error('expected setex call');
    const [key, ttl, value] = first;
    expect(key.startsWith('mcp_session:v1:org-1:')).toBe(true);
    expect(ttl).toBe(EXPECTED_TTL_SECONDS);
    const parsed: unknown = JSON.parse(value);
    expect(parsed).toEqual(VALID_SESSION);
  });
});

describe('deleteCachedSessionWithClient', () => {
  it('skips when client is unavailable', async () => {
    await expect(deleteCachedSessionWithClient(null, ORG_ID, SERVER_URL)).resolves.toBeUndefined();
  });

  it('deletes the canonical key', async () => {
    const fake = createFakeRedis();
    await writeCachedSessionWithClient(fake, ORG_ID, SERVER_URL, VALID_SESSION);
    await deleteCachedSessionWithClient(fake, ORG_ID, SERVER_URL);
    expect(fake.delCalls).toHaveLength(ONE_CALL);
    const result = await readCachedSessionWithClient(fake, ORG_ID, SERVER_URL);
    expect(result).toBeNull();
  });
});
