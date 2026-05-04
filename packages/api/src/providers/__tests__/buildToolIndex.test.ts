import { describe, expect, it, jest } from '@jest/globals';

import type { Logger } from '../../utils/logger.js';
import { buildToolIndex } from '../buildToolIndex.js';
import type { Provider, ProviderCtx, ToolDescriptor } from '../provider.js';

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

function fakeProvider(type: 'builtin' | 'mcp', id: string, descriptors: ToolDescriptor[]): Provider {
  return {
    type,
    id,
    displayName: id,
    describeTools: async () => await Promise.resolve(descriptors),
    buildTools: async () => await Promise.resolve({}),
  };
}

const td = (toolName: string): ToolDescriptor => ({
  toolName,
  description: `${toolName} desc`,
  inputSchema: { type: 'object' },
});

describe('buildToolIndex', () => {
  it('indexes tools across providers', async () => {
    const builtin = fakeProvider('builtin', 'calendar', [td('check_availability'), td('list_calendars')]);
    const mcp = fakeProvider('mcp', 'mcp-1', [td('hubspot_create_deal')]);
    const ctx = makeCtx();
    const logger = makeLogger();
    const index = await buildToolIndex([builtin, mcp], ctx, logger);
    const EXPECTED_TOOL_COUNT = 3;
    expect(index.size).toBe(EXPECTED_TOOL_COUNT);
    expect(index.get('check_availability')?.provider.id).toBe('calendar');
  });

  it('built-in wins on collision; mcp tool dropped + counter incremented', async () => {
    const counter = jest.fn();
    const builtin = fakeProvider('builtin', 'calendar', [td('shared_name')]);
    const mcp = fakeProvider('mcp', 'mcp-1', [td('shared_name')]);
    const logger = makeLogger();
    const ctx = makeCtx();
    const index = await buildToolIndex([builtin, mcp], ctx, logger, counter);
    expect(index.get('shared_name')?.provider.type).toBe('builtin');
    expect(counter).toHaveBeenCalledWith({ inBuiltin: 'calendar', inMcp: 'mcp-1', toolName: 'shared_name' });
  });
});
