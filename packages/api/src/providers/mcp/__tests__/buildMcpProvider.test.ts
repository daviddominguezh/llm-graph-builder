import type { McpServerConfig } from '@daviddh/graph-types';
import { describe, expect, it, jest } from '@jest/globals';
import type { Tool as AiSdkTool } from 'ai';
import { z } from 'zod';

import type { Logger } from '../../../utils/logger.js';
import type { ProviderCtx } from '../../provider.js';
import { MockMcpConnector } from '../MockMcpConnector.js';
import { buildMcpProvider } from '../buildMcpProvider.js';

const ONE = 1;

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

const HUBSPOT_TOOL: AiSdkTool = {
  description: 'Create a deal',
  inputSchema: z.object({ name: z.string() }),
  execute: async () => await Promise.resolve({ ok: true }),
};

const SERVER: McpServerConfig = {
  id: 'mcp-1',
  name: 'hubspot',
  transport: { type: 'http', url: 'https://x' },
  enabled: true,
};

function ctxWith(connector: MockMcpConnector): ProviderCtx {
  return {
    orgId: 'o',
    agentId: 'a',
    isChildAgent: false,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    mcpConnector: connector,
    services: () => undefined,
  };
}

function makeOneToolConnector(): MockMcpConnector {
  return new MockMcpConnector({
    toolsByServer: new Map([['mcp-1', { hubspot_create_deal: HUBSPOT_TOOL }]]),
  });
}

describe('buildMcpProvider — describeTools', () => {
  it('returns descriptors from connected client', async () => {
    const connector = makeOneToolConnector();
    const provider = buildMcpProvider(SERVER);
    const descs = await provider.describeTools(ctxWith(connector));
    expect(descs).toHaveLength(ONE);
    const [first] = descs;
    expect(first?.toolName).toBe('hubspot_create_deal');
    expect(connector.closedClients).toHaveLength(ONE);
  });

  it('returns empty when ctx.mcpConnector is missing', async () => {
    const ctx: ProviderCtx = {
      ...ctxWith(makeOneToolConnector()),
      mcpConnector: undefined,
    };
    const provider = buildMcpProvider(SERVER);
    expect(await provider.describeTools(ctx)).toEqual([]);
  });

  it('closes the client even when tools() fails', async () => {
    const connector = new MockMcpConnector({
      toolsByServer: new Map([['mcp-1', {}]]),
      failTools: true,
    });
    const provider = buildMcpProvider(SERVER);
    await expect(provider.describeTools(ctxWith(connector))).rejects.toThrow();
    expect(connector.closedClients).toHaveLength(ONE);
  });
});

describe('buildMcpProvider — buildTools', () => {
  it('filters to requested names', async () => {
    const connector = new MockMcpConnector({
      toolsByServer: new Map([['mcp-1', { hubspot_create_deal: HUBSPOT_TOOL, hubspot_other: HUBSPOT_TOOL }]]),
    });
    const provider = buildMcpProvider(SERVER);
    const out = await provider.buildTools({
      toolNames: ['hubspot_create_deal'],
      ctx: ctxWith(connector),
    });
    expect(Object.keys(out)).toEqual(['hubspot_create_deal']);
  });

  it('returns empty when ctx.mcpConnector is missing', async () => {
    const ctx: ProviderCtx = {
      ...ctxWith(makeOneToolConnector()),
      mcpConnector: undefined,
    };
    const provider = buildMcpProvider(SERVER);
    expect(await provider.buildTools({ toolNames: ['x'], ctx })).toEqual({});
  });
});
