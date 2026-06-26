import type { McpClientHandle } from '@daviddh/llm-graph-runner';
import { McpError } from '@daviddh/llm-graph-runner';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { EgressBlockedError } from '../../lib/egressGuard.js';
import { type ToolCallDeps, runToolCall } from '../toolCall.js';

type WireTransport = ReturnType<ToolCallDeps['createTransport']>;

const HTTP_OK = 200;
const HTTP_BAD = 400;
const FAST_BUDGET_MS = 20;
const SLOW_OP_MS = 1000;
const JSON_RPC_INVALID_REQUEST = -32600;

const SECRET = 's3cr3t';
const PRIVATE_HOST = '169.254.169.254';
const PRIVATE_URL = `http://${PRIVATE_HOST}/latest/meta-data`;
const PUBLIC_URL = 'https://example.com/mcp';

const TOOL_RESULT = { content: [{ type: 'text', text: 'ok' }] };

const INIT: McpClientHandle['initialized'] = {
  protocolVersion: '2024-11-05',
  serverInfo: { name: 'test', version: '1' },
  capabilities: {},
};

/** Build a real express app that hands `(req, res)` to `runToolCall` with `deps`. */
function appWith(deps: ToolCallDeps): express.Express {
  const app = express();
  app.use(express.json());
  app.post('/mcp/tools/call', (req, res) => {
    void runToolCall(req, res, deps);
  });
  return app;
}

function handleStub(): McpClientHandle {
  return {
    initialized: INIT,
    sessionId: null,
    listTools: async () => await Promise.resolve([]),
    callTool: async () => await Promise.resolve(TOOL_RESULT),
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

function baseDeps(overrides: Partial<ToolCallDeps>): ToolCallDeps {
  return {
    assertEgress: async () => {
      await Promise.resolve();
    },
    createTransport: () => wireTransportStub(),
    connectMcp: async () => await Promise.resolve(handleStub()),
    budgetMs: FAST_BUDGET_MS,
    ...overrides,
  };
}

/** A connectMcp that resolves only after `SLOW_OP_MS` — slower than the budget. */
async function slowConnect(): Promise<McpClientHandle> {
  const { promise, resolve } = Promise.withResolvers<McpClientHandle>();
  setTimeout(() => {
    resolve(handleStub());
  }, SLOW_OP_MS);
  return await promise;
}

function callBody(): Record<string, unknown> {
  return { transport: { type: 'http', url: PUBLIC_URL }, toolName: 'echo', args: { x: 'y' } };
}

beforeEach(() => {
  jest.spyOn(process.stdout, 'write').mockReturnValue(true);
  jest.spyOn(process.stderr, 'write').mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('runToolCall — guard before connect', () => {
  it('blocks a metadata URL before any transport is created or connected', async () => {
    const createTransport = jest.fn(() => wireTransportStub());
    const connectMcp = jest.fn(async () => await Promise.resolve(handleStub()));
    const deps = baseDeps({
      assertEgress: async () => {
        await Promise.reject(new EgressBlockedError('blocked'));
      },
      createTransport,
      connectMcp,
    });

    const res = await request(appWith(deps))
      .post('/mcp/tools/call')
      .send({ transport: { type: 'http', url: PRIVATE_URL }, toolName: 'echo', args: {} });

    expect(res.status).toBe(HTTP_BAD);
    expect(res.body).toEqual({ success: false, errorCategory: 'blocked' });
    expect(createTransport).not.toHaveBeenCalled();
    expect(connectMcp).not.toHaveBeenCalled();
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(PRIVATE_HOST);
    expect(serialized).not.toContain(PRIVATE_URL);
    expect(serialized).not.toContain('Egress blocked');
  });

  it('returns timeout when the tool call exceeds the budget', async () => {
    const deps = baseDeps({ budgetMs: FAST_BUDGET_MS, connectMcp: slowConnect });

    const res = await request(appWith(deps)).post('/mcp/tools/call').send(callBody());

    expect(res.status).toBe(HTTP_BAD);
    expect(res.body).toEqual({ success: false, errorCategory: 'timeout' });
  });
});

describe('runToolCall — redaction + success', () => {
  it('maps an upstream error to a category without leaking the secret in its message', async () => {
    const deps = baseDeps({
      connectMcp: async () =>
        await Promise.reject(
          new McpError(JSON_RPC_INVALID_REQUEST, `Tool failed at ${PRIVATE_URL} token=${SECRET}`)
        ),
    });

    const res = await request(appWith(deps)).post('/mcp/tools/call').send(callBody());

    expect(res.status).toBe(HTTP_BAD);
    expect(res.body).toEqual({ success: false, errorCategory: 'protocol' });
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(PRIVATE_HOST);
  });

  it('returns the tool result on success', async () => {
    const res = await request(appWith(baseDeps({})))
      .post('/mcp/tools/call')
      .send(callBody());

    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ success: true, result: TOOL_RESULT });
  });
});
