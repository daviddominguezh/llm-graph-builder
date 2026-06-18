import { describe, expect, it, jest } from '@jest/globals';

import type { Logger } from '../../utils/logger.js';
import { buildToolIndex } from '../buildToolIndex.js';
import type { Provider, ProviderCtx, ToolDescriptor } from '../provider.js';
import { namespaceToolName } from '../types.js';

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
    tenantId: 'test-tenant-id',
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
  it('indexes tools across providers using namespaced keys', async () => {
    const builtin = fakeProvider('builtin', 'calendar', [td('check_availability'), td('list_calendars')]);
    const mcp = fakeProvider('mcp', 'mcp-1', [td('hubspot_create_deal')]);
    const ctx = makeCtx();
    const logger = makeLogger();
    const index = await buildToolIndex([builtin, mcp], ctx, logger);
    const EXPECTED_TOOL_COUNT = 3;
    expect(index.size).toBe(EXPECTED_TOOL_COUNT);
    expect(index.get(namespaceToolName('calendar', 'check_availability'))?.provider.id).toBe('calendar');
    expect(index.get(namespaceToolName('mcp-1', 'hubspot_create_deal'))?.provider.type).toBe('mcp');
  });

  it('namespacing prevents same-toolName collisions across providers', async () => {
    const counter = jest.fn();
    const kv = fakeProvider('builtin', 'kv_store', [td('search')]);
    const rag = fakeProvider('builtin', 'rag', [td('search')]);
    const ctx = makeCtx();
    const logger = makeLogger();
    const index = await buildToolIndex([kv, rag], ctx, logger, counter);
    const EXPECTED_TOOL_COUNT = 2;
    expect(index.size).toBe(EXPECTED_TOOL_COUNT);
    expect(index.get(namespaceToolName('kv_store', 'search'))?.provider.id).toBe('kv_store');
    expect(index.get(namespaceToolName('rag', 'search'))?.provider.id).toBe('rag');
    expect(counter).not.toHaveBeenCalled();
  });

  it('built-in wins on explicit namespaced collision; loser dropped + reporter invoked', async () => {
    const counter = jest.fn();
    // Both providers explicitly publish the same already-namespaced shape — the
    // only way a collision can happen now. Defense-in-depth path.
    const builtin = fakeProvider('builtin', 'calendar', [td('shared_name')]);
    const mcp = fakeProvider('mcp', 'calendar', [td('shared_name')]);
    const index = await buildToolIndex([builtin, mcp], makeCtx(), makeLogger(), counter);
    const namespaced = namespaceToolName('calendar', 'shared_name');
    expect(index.get(namespaced)?.provider.type).toBe('builtin');
    expect(counter).toHaveBeenCalledWith(expectedConflictPayload(namespaced));
  });
});

function expectedConflictPayload(namespacedName: string): Record<string, string> {
  return {
    namespacedName,
    winnerProviderId: 'calendar',
    winnerProviderType: 'builtin',
    loserProviderId: 'calendar',
    loserProviderType: 'mcp',
    toolName: 'shared_name',
  };
}
