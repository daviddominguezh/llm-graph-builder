import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClientHandle } from '@daviddh/llm-graph-runner';
import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { createConnectionPool } from '../../../mcp/pool/connectionPool.js';
import type { PreflightDeps } from '../mcpPreflight.js';
import { preflightMcp } from '../mcpPreflight.js';
import { HTTP_UNAUTHORIZED, buildApp } from './testHarness.js';

process.env.EDGE_FUNCTION_MASTER_KEY = 'test-key';

type EmbedFn = (text: string) => Promise<number[]>;
jest.unstable_mockModule('../../../rag/embeddings.js', () => ({
  embedQuery: jest.fn<EmbedFn>(),
}));

const { internalRouter } = await import('../internalRouter.js');

const NONE = 0;

const INIT: McpClientHandle['initialized'] = {
  protocolVersion: '2024-11-05',
  serverInfo: { name: 'x', version: '1' },
  capabilities: {},
};

const server: McpServerConfig = {
  id: 'srv1',
  name: 'srv',
  enabled: true,
  transport: { type: 'http', url: 'https://srv.test/mcp' },
};

function handle(): McpClientHandle {
  return {
    initialized: INIT,
    sessionId: null,
    listTools: async () => await Promise.resolve([]),
    callTool: async () => await Promise.resolve({ content: [] }),
    close: async () => {
      await Promise.resolve();
    },
  };
}

async function reject(message: string): Promise<never> {
  await Promise.resolve();
  throw new Error(message);
}

function baseDeps(over: Partial<PreflightDeps> = {}): PreflightDeps {
  return {
    pool: createConnectionPool(),
    resolveBinding: async () => await Promise.resolve({ orgId: 'org1', server }),
    revalidateEgress: async () => {
      await Promise.resolve();
    },
    connect: async () => await Promise.resolve(handle()),
    ...over,
  };
}

const baseArgs = { agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1' };
const KEY = 'ag1::t1::srv1';

describe('preflightMcp — warm path', () => {
  it('warms the pool entry and returns ok on a healthy connect', async () => {
    const pool = createConnectionPool();
    const out = await preflightMcp({ ...baseArgs, deps: baseDeps({ pool }) });
    expect(out).toEqual({ ok: true });
    expect(pool.has(KEY)).toBe(true);
  });

  it('releases the borrow after warming (no leaked refcount)', async () => {
    const pool = createConnectionPool();
    await preflightMcp({ ...baseArgs, deps: baseDeps({ pool }) });
    expect(pool.entries().get(KEY)?.borrows).toBe(NONE);
    const leaked = [...pool.entries().values()].filter((e) => e.borrows > NONE);
    expect(leaked).toHaveLength(NONE);
  });
});

describe('preflightMcp — failure boundary', () => {
  it('returns not-ok when connect fails', async () => {
    const out = await preflightMcp({
      ...baseArgs,
      deps: baseDeps({ connect: async () => await reject('connection refused') }),
    });
    expect(out).toEqual({ ok: false });
  });

  it('returns not-ok when binding resolution fails', async () => {
    const out = await preflightMcp({
      ...baseArgs,
      deps: baseDeps({ resolveBinding: async () => await reject('binding not found') }),
    });
    expect(out).toEqual({ ok: false });
  });

  it('returns not-ok when egress re-validation blocks the server', async () => {
    const out = await preflightMcp({
      ...baseArgs,
      deps: baseDeps({ revalidateEgress: async () => await reject('EgressBlocked') }),
    });
    expect(out).toEqual({ ok: false });
  });

  it('leaks no borrow when connect fails', async () => {
    const pool = createConnectionPool();
    await preflightMcp({
      ...baseArgs,
      deps: baseDeps({ pool, connect: async () => await reject('connection refused') }),
    });
    const leaked = [...pool.entries().values()].filter((e) => e.borrows > NONE);
    expect(leaked).toHaveLength(NONE);
  });
});

describe('handleMcpPreflight — master-key gate', () => {
  it('rejects a request with no x-master-key header', async () => {
    const app = buildApp(internalRouter, express);
    const res = await request(app)
      .post('/internal/mcp/preflight')
      .send({ ...baseArgs });
    expect(res.status).toBe(HTTP_UNAUTHORIZED);
  });
});
