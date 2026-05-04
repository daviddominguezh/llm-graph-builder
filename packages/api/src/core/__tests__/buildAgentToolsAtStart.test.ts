import { describe, expect, it, jest } from '@jest/globals';
import { z } from 'zod';

import type { ProviderCtx } from '../../providers/provider.js';
import type { Registry, RegistryBuildResult } from '../../providers/registry.js';
import type { SelectedTool } from '../../types/selectedTool.js';
import type { Logger } from '../../utils/logger.js';
import { buildAgentToolsAtStart } from '../buildAgentToolsAtStart.js';

function makeLogger(overrides: Partial<Logger> = {}): Logger {
  const noop = jest.fn();
  return {
    error: noop,
    warn: noop,
    help: noop,
    data: noop,
    info: noop,
    debug: noop,
    prompt: noop,
    http: noop,
    verbose: noop,
    input: noop,
    silly: noop,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ProviderCtx> = {}): ProviderCtx {
  return {
    orgId: 'o',
    agentId: 'a',
    isChildAgent: false,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: () => undefined,
    ...overrides,
  };
}

function makeRegistry(result: RegistryBuildResult): Registry {
  return {
    providers: [],
    buildSelected: async () => await Promise.resolve(result),
    findToolByName: async () => await Promise.resolve(null),
    describeAll: async () => await Promise.resolve([]),
  };
}

const CALENDAR_REF: SelectedTool = {
  providerType: 'builtin',
  providerId: 'calendar',
  toolName: 'list_calendars',
};

const EMPTY_BUILD_RESULT: RegistryBuildResult = { tools: {}, staleRefs: [], failedProviders: [] };

const STUB_TOOL = {
  description: '',
  inputSchema: z.object({}),
  execute: async (): Promise<null> => await Promise.resolve(null),
};

const CALENDAR_BUILD_RESULT: RegistryBuildResult = {
  tools: { list_calendars: STUB_TOOL },
  staleRefs: [],
  failedProviders: [],
};

const WARNING_BUILD_RESULT: RegistryBuildResult = {
  tools: {},
  staleRefs: [{ providerType: 'builtin', providerId: 'forms', toolName: 'gone' }],
  failedProviders: [{ providerType: 'mcp', providerId: 'mcp-x', reason: 'auth_failed', detail: 'expired' }],
};

describe('buildAgentToolsAtStart', () => {
  it('returns empty result for empty selected_tools without invoking registry', async () => {
    const buildSelected: Registry['buildSelected'] = jest.fn(
      async () => await Promise.resolve(EMPTY_BUILD_RESULT)
    );
    const fakeRegistry: Registry = { ...makeRegistry(EMPTY_BUILD_RESULT), buildSelected };
    const result = await buildAgentToolsAtStart(fakeRegistry, makeCtx(), []);
    expect(result.tools).toEqual({});
    expect(result.staleRefs).toEqual([]);
    expect(result.failedProviders).toEqual([]);
    expect(buildSelected).not.toHaveBeenCalled();
  });

  it('passes refs through to registry.buildSelected', async () => {
    const result = await buildAgentToolsAtStart(makeRegistry(CALENDAR_BUILD_RESULT), makeCtx(), [
      CALENDAR_REF,
    ]);
    expect(result.tools.list_calendars).toBeDefined();
  });

  it('logs stale refs and failed providers via ctx.logger.warn', async () => {
    const warn = jest.fn();
    const ctx = makeCtx({ logger: makeLogger({ warn }) });
    await buildAgentToolsAtStart(makeRegistry(WARNING_BUILD_RESULT), ctx, [CALENDAR_REF]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('stale'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('build_tools.failure'));
  });
});
