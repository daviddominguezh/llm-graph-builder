import type { McpServerConfig } from '@daviddh/graph-types';
import { describe, expect, it, jest } from '@jest/globals';

import type { Logger } from '../../../utils/logger.js';
import type { ProviderCtx } from '../../provider.js';
import { buildMcpProvider } from '../buildMcpProvider.js';
import { type MockTransport, createMockTransport } from '../client/__tests__/mockTransport.js';
import { MCP_PROTOCOL_VERSION } from '../client/types.js';
import type { SessionCacheIo } from '../ensureSession.js';
import type { CachedMcpSession } from '../sessionCache.js';
import { SessionExpiredError } from '../transport/errors.js';

const ONE = 1;
const TWO = 2;
const FIRST_INDEX = 0;
const SECOND_INDEX = 1;
const TOOL_NAME = 'create_deal';
const SAMPLE_SESSION_ID = 'sess-cached-abc';
const SAMPLE_SERVER_VERSION = '1.0.0';
const SAMPLE_CAPTURED_AT = 1_700_000_000_000;

const VALID_INIT_RESPONSE = {
  protocolVersion: MCP_PROTOCOL_VERSION,
  serverInfo: { name: 'srv', version: SAMPLE_SERVER_VERSION },
  capabilities: { tools: { listChanged: false } },
};

const SAMPLE_TOOL = {
  name: 'create_deal',
  description: 'Create a deal',
  inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
};

const ANOTHER_TOOL = {
  name: 'list_deals',
  description: 'List deals',
  inputSchema: { type: 'object', properties: {} },
};

const STDIO_SERVER: McpServerConfig = {
  id: 'mcp-1',
  name: 'fake',
  transport: { type: 'stdio', command: 'echo' },
  enabled: true,
};

const HTTP_SERVER: McpServerConfig = {
  id: 'mcp-http',
  name: 'http-srv',
  transport: { type: 'http', url: 'https://example.com/mcp' },
  enabled: true,
};

interface FakeSessionCache extends SessionCacheIo {
  store: Map<string, CachedMcpSession>;
  readCalls: string[];
  writeCalls: Array<{ orgId: string; serverUrl: string; session: CachedMcpSession }>;
  deleteCalls: string[];
}

function createFakeSessionCache(): FakeSessionCache {
  const store = new Map<string, CachedMcpSession>();
  const readCalls: string[] = [];
  const writeCalls: FakeSessionCache['writeCalls'] = [];
  const deleteCalls: string[] = [];
  return {
    store,
    readCalls,
    writeCalls,
    deleteCalls,
    read: async (orgId, serverUrl) => {
      await Promise.resolve();
      readCalls.push(`${orgId}|${serverUrl}`);
      return store.get(`${orgId}|${serverUrl}`) ?? null;
    },
    write: async (orgId, serverUrl, session) => {
      await Promise.resolve();
      writeCalls.push({ orgId, serverUrl, session });
      store.set(`${orgId}|${serverUrl}`, session);
    },
    delete: async (orgId, serverUrl) => {
      await Promise.resolve();
      deleteCalls.push(`${orgId}|${serverUrl}`);
      store.delete(`${orgId}|${serverUrl}`);
    },
  };
}

function buildCachedSession(): CachedMcpSession {
  return {
    sessionId: SAMPLE_SESSION_ID,
    serverInfo: { name: 'srv', version: SAMPLE_SERVER_VERSION },
    capturedAt: SAMPLE_CAPTURED_AT,
  };
}

function makeLogger(): Logger {
  return {
    error: jest.fn(),
    warn: jest.fn(),
    help: jest.fn(),
    data: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    prompt: jest.fn(),
    http: jest.fn(),
    verbose: jest.fn(),
    input: jest.fn(),
    silly: jest.fn(),
  };
}

function makeCtx(): ProviderCtx {
  return {
    orgId: 'o',
    agentId: 'a',
    isChildAgent: false,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: () => undefined,
  };
}

interface TransportFactoryRecorder {
  factory: (server: McpServerConfig) => Promise<MockTransport>;
  transports: MockTransport[];
}

function makeTransportFactory(setup: (t: MockTransport) => void): TransportFactoryRecorder {
  const transports: MockTransport[] = [];
  const factory = async (_server: McpServerConfig): Promise<MockTransport> => {
    const t = createMockTransport();
    t.responses.set('initialize', VALID_INIT_RESPONSE);
    setup(t);
    transports.push(t);
    return await Promise.resolve(t);
  };
  return { factory, transports };
}

describe('buildMcpProvider — describeTools', () => {
  it('returns descriptors with raw JSON Schema unchanged', async () => {
    const { factory, transports } = makeTransportFactory((t) => {
      t.responses.set('tools/list', { tools: [SAMPLE_TOOL] });
    });
    const provider = buildMcpProvider(STDIO_SERVER, { createTransport: factory });
    const descs = await provider.describeTools(makeCtx());
    expect(descs).toHaveLength(ONE);
    const [first] = descs;
    expect(first?.toolName).toBe(TOOL_NAME);
    expect(first?.description).toBe('Create a deal');
    expect(first?.inputSchema).toEqual(SAMPLE_TOOL.inputSchema);
    expect(transports[FIRST_INDEX]?.closed).toBe(true);
  });

  it('closes the transport even when listTools fails', async () => {
    const { factory, transports } = makeTransportFactory((t) => {
      t.responses.set('tools/list', { wrong: 'shape' });
    });
    const provider = buildMcpProvider(STDIO_SERVER, { createTransport: factory });
    await expect(provider.describeTools(makeCtx())).rejects.toThrow();
    expect(transports[FIRST_INDEX]?.closed).toBe(true);
  });
});

describe('buildMcpProvider — buildTools', () => {
  it('filters to requested names and produces working execute closures', async () => {
    const { factory, transports } = makeTransportFactory((t) => {
      t.responses.set('tools/list', { tools: [SAMPLE_TOOL, ANOTHER_TOOL] });
      t.responses.set('tools/call', { content: [{ type: 'text', text: 'ok' }] });
    });
    const provider = buildMcpProvider(STDIO_SERVER, { createTransport: factory });
    const out = await provider.buildTools({
      toolNames: [TOOL_NAME],
      ctx: makeCtx(),
    });
    const { [TOOL_NAME]: tool } = out;
    expect(Object.keys(out)).toEqual([TOOL_NAME]);
    expect(tool?.inputSchema).toEqual(SAMPLE_TOOL.inputSchema);
    // First transport closes after listTools.
    expect(transports[FIRST_INDEX]?.closed).toBe(true);

    // Calling execute opens a fresh transport, runs tools/call, then closes.
    const result = await tool?.execute({ name: 'acme' });
    expect(transports).toHaveLength(TWO);
    expect(transports[SECOND_INDEX]?.closed).toBe(true);
    expect(transports[SECOND_INDEX]?.requests.find((r) => r.method === 'tools/call')?.params).toEqual({
      name: TOOL_NAME,
      arguments: { name: 'acme' },
    });
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('returns empty when no requested name matches', async () => {
    const { factory } = makeTransportFactory((t) => {
      t.responses.set('tools/list', { tools: [SAMPLE_TOOL] });
    });
    const provider = buildMcpProvider(STDIO_SERVER, { createTransport: factory });
    const out = await provider.buildTools({
      toolNames: ['nonexistent'],
      ctx: makeCtx(),
    });
    expect(out).toEqual({});
  });
});

function httpServerCacheKey(): string {
  return `o|${HTTP_SERVER.transport.type === 'http' ? HTTP_SERVER.transport.url : ''}`;
}

interface ExpiringFactory {
  factory: (server: McpServerConfig) => Promise<MockTransport>;
  transports: MockTransport[];
}

const ONE_DELTA = 1;

function makeReattachThenFreshFactory(): ExpiringFactory {
  let attempt = 0;
  const transports: MockTransport[] = [];
  const factory = async (_server: McpServerConfig): Promise<MockTransport> => {
    await Promise.resolve();
    attempt += ONE_DELTA;
    const t = createMockTransport();
    if (attempt === ONE) {
      t.request = async () => {
        await Promise.resolve();
        throw new SessionExpiredError();
      };
    } else {
      t.responses.set('initialize', VALID_INIT_RESPONSE);
      t.responses.set('tools/list', { tools: [SAMPLE_TOOL] });
    }
    transports.push(t);
    return t;
  };
  return { factory, transports };
}

describe('buildMcpProvider — session cache (HTTP)', () => {
  it('writes the session id to cache after a fresh initialize', async () => {
    const { factory } = makeTransportFactory((t) => {
      t.responses.set('tools/list', { tools: [SAMPLE_TOOL] });
      t.setSessionId(SAMPLE_SESSION_ID);
    });
    const cache = createFakeSessionCache();
    const provider = buildMcpProvider(HTTP_SERVER, { createTransport: factory, sessionCache: cache });
    await provider.describeTools(makeCtx());
    const { writeCalls } = cache;
    expect(writeCalls).toHaveLength(ONE);
    const [first] = writeCalls;
    expect(first?.session.sessionId).toBe(SAMPLE_SESSION_ID);
    expect(first?.session.serverInfo.version).toBe(SAMPLE_SERVER_VERSION);
  });
});

describe('buildMcpProvider — session cache reattach', () => {
  it('reattaches via setSessionId when cache hits', async () => {
    const { factory, transports } = makeTransportFactory((t) => {
      t.responses.set('tools/list', { tools: [SAMPLE_TOOL] });
    });
    const cache = createFakeSessionCache();
    cache.store.set(httpServerCacheKey(), buildCachedSession());
    const provider = buildMcpProvider(HTTP_SERVER, { createTransport: factory, sessionCache: cache });
    await provider.describeTools(makeCtx());
    expect(transports[FIRST_INDEX]?.sessionId).toBe(SAMPLE_SESSION_ID);
  });

  it('falls back to fresh init when reattach throws SessionExpiredError', async () => {
    const { factory, transports } = makeReattachThenFreshFactory();
    const cache = createFakeSessionCache();
    cache.store.set(httpServerCacheKey(), buildCachedSession());
    const provider = buildMcpProvider(HTTP_SERVER, { createTransport: factory, sessionCache: cache });
    const descs = await provider.describeTools(makeCtx());
    expect(descs).toHaveLength(ONE);
    expect(cache.deleteCalls).toHaveLength(ONE);
    expect(transports).toHaveLength(TWO);
  });
});
