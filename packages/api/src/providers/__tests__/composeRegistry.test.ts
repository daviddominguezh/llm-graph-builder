import type { McpServerConfig } from '@daviddh/graph-types';
import { describe, expect, it, jest } from '@jest/globals';
import { z } from 'zod';

import type { SelectedTool } from '../../types/selectedTool.js';
import type { Logger } from '../../utils/logger.js';
import type { Provider, ProviderCtx, ToolDescriptor } from '../provider.js';
import { composeRegistry } from '../registry.js';
import type { OpenFlowTool } from '../types.js';

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
    orgId: 'org-1',
    agentId: 'agent-1',
    isChildAgent: false,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: () => undefined,
  };
}

function fakeProvider(type: 'builtin' | 'mcp', id: string): Provider {
  return {
    type,
    id,
    displayName: id,
    describeTools: jest.fn(async (): Promise<ToolDescriptor[]> => await Promise.resolve([])),
    buildTools: jest.fn(async (): Promise<Record<string, OpenFlowTool>> => await Promise.resolve({})),
  };
}

function makeStubTool(): OpenFlowTool {
  return {
    description: '',
    inputSchema: z.object({}),
    execute: async () => await Promise.resolve(null),
  };
}

function makeBuilderProvider(): Provider {
  return {
    type: 'builtin',
    id: 'calendar',
    displayName: 'calendar',
    describeTools: async () => await Promise.resolve([]),
    buildTools: jest.fn(
      async (): Promise<Record<string, OpenFlowTool>> =>
        await Promise.resolve({ check_availability: makeStubTool() })
    ),
  };
}

const fakeMcp: McpServerConfig = {
  id: 'mcp-1',
  name: 'fake-mcp',
  transport: { type: 'http', url: 'https://fake.example/mcp' },
  enabled: true,
};

describe('composeRegistry — compose-time semantics', () => {
  it('performs no I/O at compose time (no provider methods called)', () => {
    const builtin = fakeProvider('builtin', 'calendar');
    composeRegistry({
      builtIns: new Map([['calendar', builtin]]),
      orgMcpServers: [],
      logger: makeLogger(),
    });
    expect(builtin.describeTools).not.toHaveBeenCalled();
    expect(builtin.buildTools).not.toHaveBeenCalled();
  });

  it('does not eagerly perform MCP I/O at compose', () => {
    expect(() =>
      composeRegistry({ builtIns: new Map(), orgMcpServers: [fakeMcp], logger: makeLogger() })
    ).not.toThrow();
  });

  it('returns an immutable provider list', () => {
    const builtin = fakeProvider('builtin', 'calendar');
    const registry = composeRegistry({
      builtIns: new Map([['calendar', builtin]]),
      orgMcpServers: [],
      logger: makeLogger(),
    });
    expect(Object.isFrozen(registry.providers)).toBe(true);
  });
});

describe('composeRegistry — buildSelected', () => {
  it('groups by provider and returns merged tools', async () => {
    const provider = makeBuilderProvider();
    const registry = composeRegistry({
      builtIns: new Map([['calendar', provider]]),
      orgMcpServers: [],
      logger: makeLogger(),
    });
    const refs: SelectedTool[] = [
      { providerType: 'builtin', providerId: 'calendar', toolName: 'check_availability' },
    ];
    const result = await registry.buildSelected({ refs, ctx: makeCtx() });
    expect(result.tools.check_availability).toBeDefined();
    expect(result.staleRefs).toEqual([]);
    expect(result.failedProviders).toEqual([]);
  });

  it('returns staleRefs for unknown providerId', async () => {
    const registry = composeRegistry({
      builtIns: new Map(),
      orgMcpServers: [],
      logger: makeLogger(),
    });
    const refs: SelectedTool[] = [{ providerType: 'builtin', providerId: 'nope', toolName: 'x' }];
    const result = await registry.buildSelected({ refs, ctx: makeCtx() });
    expect(result.tools).toEqual({});
    expect(result.staleRefs).toEqual(refs);
  });
});
