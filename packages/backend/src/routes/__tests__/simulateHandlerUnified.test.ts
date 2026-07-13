import type { McpServerConfig, RuntimeGraph } from '@daviddh/graph-types';
import * as realRunner from '@daviddh/llm-graph-runner';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import * as realLifecycle from '../../mcp/lifecycle.js';
import type { SimulateRequest } from '../../types.js';

/* ------------------------------------------------------------------ */
/*  Seam mocks — keep the runner real except the workflow engine step   */
/* ------------------------------------------------------------------ */

const HTTP_BAD_REQUEST = 400;

const mockCreateMcpSession = jest.fn<() => Promise<{ clients: unknown[]; tools: Record<string, unknown> }>>(
  async () => await Promise.resolve({ clients: [], tools: {} })
);
const mockCloseMcpSession = jest.fn<() => Promise<void>>(async () => {
  await Promise.resolve();
});
const mockAssertEgress = jest.fn<() => Promise<void>>(async () => {
  await Promise.resolve();
});
const mockExecuteWithCallbacks = jest.fn<() => Promise<null>>(async () => await Promise.resolve(null));

jest.unstable_mockModule('../../mcp/lifecycle.js', () => ({
  ...realLifecycle,
  createMcpSession: mockCreateMcpSession,
  closeMcpSession: mockCloseMcpSession,
}));

jest.unstable_mockModule('../../lib/assertEgressForServers.js', () => ({
  assertEgressForServers: mockAssertEgress,
}));

jest.unstable_mockModule('@daviddh/llm-graph-runner', () => ({
  ...realRunner,
  executeWithCallbacks: mockExecuteWithCallbacks,
}));

const { handleSimulateUnified } = await import('../simulateHandlerUnified.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const graph: RuntimeGraph = {
  startNode: 'Start',
  agents: [{ id: 'main', description: 'Main' }],
  nodes: [{ id: 'Start', text: 'Hi', kind: 'agent', agent: 'main', global: false, description: '' }],
  edges: [],
};

function workflowBody(servers: McpServerConfig[]): SimulateRequest {
  return {
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
}

function appWith(): express.Express {
  const app = express();
  app.use(express.json());
  app.post('/simulate', (req, res) => {
    void handleSimulateUnified(req, res);
  });
  return app;
}

afterEach(() => {
  jest.clearAllMocks();
  mockExecuteWithCallbacks.mockImplementation(async () => await Promise.resolve(null));
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('handleSimulateUnified — appType routing', () => {
  it('routes a workflow body (no appType) through the workflow engine and completes', async () => {
    const res = await request(appWith()).post('/simulate').send(workflowBody([]));

    expect(mockExecuteWithCallbacks).toHaveBeenCalled();
    expect(res.text).toContain('"type":"simulation_complete"');
  });

  it('routes an agent body to the agent branch (zod validation rejects a malformed one)', async () => {
    const res = await request(appWith()).post('/simulate').send({ appType: 'agent' });

    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(mockExecuteWithCallbacks).not.toHaveBeenCalled();
  });
});
