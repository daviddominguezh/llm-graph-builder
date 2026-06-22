import type { McpClientHandle, RawMcpTool } from '@daviddh/llm-graph-runner';
import { McpError } from '@daviddh/llm-graph-runner';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { EgressBlockedError } from '../../lib/egressGuard.js';
import { type DiscoverDeps, runDiscover } from '../discover.js';

type WireTransport = ReturnType<DiscoverDeps['createTransport']>;

const HTTP_OK = 200;
const HTTP_BAD = 400;
const FAST_BUDGET_MS = 20;
const SLOW_OP_MS = 1000;
const JSON_RPC_INVALID_REQUEST = -32600;

const SECRET = 's3cr3t';
const PRIVATE_HOST = '10.0.0.5';
const PRIVATE_URL = `http://${PRIVATE_HOST}/internal`;
const PUBLIC_URL = 'https://example.com/mcp';

const INIT: McpClientHandle['initialized'] = {
  protocolVersion: '2024-11-05',
  serverInfo: { name: 'test', version: '1' },
  capabilities: {},
};
const TOOLS: RawMcpTool[] = [{ name: 'echo', description: 'echoes', inputSchema: { type: 'object' } }];

/** Build a real express app that hands `(req, res)` to `runDiscover` with `deps`. */
function appWith(deps: DiscoverDeps): express.Express {
  const app = express();
  app.use(express.json());
  app.post('/mcp/discover', (req, res) => {
    void runDiscover(req, res, deps);
  });
  return app;
}

function handleStub(tools: RawMcpTool[]): McpClientHandle {
  return {
    initialized: INIT,
    sessionId: null,
    listTools: async () => await Promise.resolve(tools),
    callTool: async () => await Promise.resolve({ content: [] }),
    close: async () => {
      await Promise.resolve();
    },
  };
}

function wireTransportStub(): WireTransport {
  return {
    request: async () => await Promise.resolve(null),
    notify: async () => {
      await Promise.resolve();
    },
    sessionId: null,
    setSessionId: () => {
      /* no-op */
    },
    close: async () => {
      await Promise.resolve();
    },
  };
}

function baseDeps(overrides: Partial<DiscoverDeps>): DiscoverDeps {
  return {
    assertEgress: async () => {
      await Promise.resolve();
    },
    createTransport: () => wireTransportStub(),
    connectMcp: async () => await Promise.resolve(handleStub(TOOLS)),
    budgetMs: FAST_BUDGET_MS,
    ...overrides,
  };
}

/** A connectMcp that resolves only after `SLOW_OP_MS` — slower than the budget. */
async function slowConnect(): Promise<McpClientHandle> {
  const { promise, resolve } = Promise.withResolvers<McpClientHandle>();
  setTimeout(() => {
    resolve(handleStub(TOOLS));
  }, SLOW_OP_MS);
  return await promise;
}

beforeEach(() => {
  jest.spyOn(process.stdout, 'write').mockReturnValue(true);
  jest.spyOn(process.stderr, 'write').mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('runDiscover — guard + budget', () => {
  it('blocks a private URL before any transport is created', async () => {
    const createTransport = jest.fn(() => wireTransportStub());
    const connectMcp = jest.fn(async () => await Promise.resolve(handleStub(TOOLS)));
    const deps = baseDeps({
      assertEgress: async () => {
        await Promise.reject(new EgressBlockedError('blocked'));
      },
      createTransport,
      connectMcp,
    });

    const res = await request(appWith(deps))
      .post('/mcp/discover')
      .send({ transport: { type: 'http', url: PRIVATE_URL } });

    expect(res.status).toBe(HTTP_BAD);
    expect(res.body).toEqual({ errorCategory: 'blocked' });
    expect(createTransport).not.toHaveBeenCalled();
    expect(connectMcp).not.toHaveBeenCalled();
  });

  it('returns timeout when discovery exceeds the budget', async () => {
    const deps = baseDeps({ budgetMs: FAST_BUDGET_MS, connectMcp: slowConnect });

    const res = await request(appWith(deps))
      .post('/mcp/discover')
      .send({ transport: { type: 'http', url: PUBLIC_URL } });

    expect(res.status).toBe(HTTP_BAD);
    expect(res.body).toEqual({ errorCategory: 'timeout' });
  });
});

describe('runDiscover — redaction + success', () => {
  it('maps an upstream error to a category without leaking the message', async () => {
    const deps = baseDeps({
      connectMcp: async () =>
        await Promise.reject(
          new McpError(JSON_RPC_INVALID_REQUEST, `Invalid request to ${PRIVATE_URL} token=${SECRET}`)
        ),
    });

    const res = await request(appWith(deps))
      .post('/mcp/discover')
      .send({ transport: { type: 'http', url: PUBLIC_URL } });

    expect(res.status).toBe(HTTP_BAD);
    expect(res.body).toEqual({ errorCategory: 'protocol' });
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(PRIVATE_HOST);
  });

  it('returns discovered tools on success', async () => {
    const res = await request(appWith(baseDeps({})))
      .post('/mcp/discover')
      .send({ transport: { type: 'http', url: PUBLIC_URL } });

    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({
      tools: [{ name: 'echo', description: 'echoes', inputSchema: { type: 'object' } }],
    });
  });
});
