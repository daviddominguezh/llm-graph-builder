import type { McpServerConfig, RuntimeGraph } from '@daviddh/graph-types';
import * as realRunner from '@daviddh/llm-graph-runner';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { EgressBlockedError } from '../../lib/egressGuard.js';
import type { SimulateRequest } from '../../types.js';

/* ------------------------------------------------------------------ */
/*  Seam mocks                                                         */
/* ------------------------------------------------------------------ */

const ONCE = 1;

const mockCreateMcpSession = jest.fn<() => Promise<{ clients: unknown[]; tools: Record<string, unknown> }>>();
const mockCloseMcpSession = jest.fn<() => Promise<void>>(async () => {
  await Promise.resolve();
});
const mockAssertEgress = jest.fn<() => Promise<void>>(async () => {
  await Promise.resolve();
});
const mockExecuteWithCallbacks = jest.fn<() => Promise<null>>(async () => await Promise.resolve(null));

jest.unstable_mockModule('../../mcp/lifecycle.js', () => ({
  createMcpSession: mockCreateMcpSession,
  closeMcpSession: mockCloseMcpSession,
}));

jest.unstable_mockModule('../../lib/assertEgressForServers.js', () => ({
  assertEgressForServers: mockAssertEgress,
}));

// Override only `executeWithCallbacks`; the rest of the runner must stay real
// because many modules in the import graph (e.g. the calendar service and the
// provider/registry builders) depend on its named exports. `realRunner` is
// captured by the top-level static import above, which is evaluated BEFORE this
// (non-hoisted) `unstable_mockModule` call registers the mock — so it holds the
// genuine module. Re-importing the specifier here instead would resolve back to
// this mock and recurse into the factory until the worker runs out of heap.
jest.unstable_mockModule('@daviddh/llm-graph-runner', () => ({
  ...realRunner,
  executeWithCallbacks: mockExecuteWithCallbacks,
}));

const { handleSimulate } = await import('../simulateHandler.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const PRIVATE_HOST = '10.0.0.5';
const PRIVATE_URL = `http://${PRIVATE_HOST}/internal`;
const PUBLIC_URL = 'https://example.com/mcp';

function privateServer(): McpServerConfig {
  return { id: 's1', name: 's1', transport: { type: 'http', url: PRIVATE_URL }, enabled: true };
}

function publicServer(): McpServerConfig {
  return { id: 's2', name: 's2', transport: { type: 'http', url: PUBLIC_URL }, enabled: true };
}

const graph: RuntimeGraph = {
  startNode: 'Start',
  agents: [{ id: 'main', description: 'Main' }],
  nodes: [{ id: 'Start', text: 'Hi', kind: 'agent', agent: 'main', global: false, description: '' }],
  edges: [],
};

function body(servers: McpServerConfig[]): SimulateRequest {
  const req: SimulateRequest = {
    graph: { ...graph, mcpServers: servers },
    apiKey: 'k',
    modelId: 'm',
    sessionID: 'sess',
    tenantID: 'tenant',
    userID: 'user',
    messages: [],
    currentNode: 'Start',
    data: {},
    quickReplies: {},
  };
  return req;
}

function appWith(): express.Express {
  const app = express();
  app.use(express.json());
  app.post('/simulate', (req, res) => {
    void handleSimulate(req, res);
  });
  return app;
}

afterEach(() => {
  jest.clearAllMocks();
  mockCloseMcpSession.mockImplementation(async () => {
    await Promise.resolve();
  });
  mockExecuteWithCallbacks.mockImplementation(async () => await Promise.resolve(null));
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('handleSimulate — egress guard', () => {
  it('blocks a private MCP URL before connecting and returns a redacted category', async () => {
    mockAssertEgress.mockRejectedValueOnce(new EgressBlockedError('blocked'));
    const res = await request(appWith())
      .post('/simulate')
      .send(body([privateServer()]));

    expect(mockCreateMcpSession).not.toHaveBeenCalled();
    expect(res.text).toContain('"errorCategory":"blocked"');
    expect(res.text).not.toContain(PRIVATE_HOST);
    expect(res.text).not.toContain(PRIVATE_URL);
    expect(res.text).not.toContain('Egress blocked');
  });

  it('proceeds to connect when egress passes', async () => {
    mockCreateMcpSession.mockResolvedValueOnce({ clients: [], tools: {} });
    const res = await request(appWith())
      .post('/simulate')
      .send(body([publicServer()]));

    expect(mockAssertEgress).toHaveBeenCalledTimes(ONCE);
    expect(mockCreateMcpSession).toHaveBeenCalledTimes(ONCE);
    expect(res.text).toContain('"type":"simulation_complete"');
    expect(res.text).not.toContain('"errorCategory"');
  });
});
