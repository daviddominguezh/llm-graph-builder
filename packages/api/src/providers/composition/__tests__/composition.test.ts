import { describe, expect, it, jest } from '@jest/globals';

import type { Logger } from '../../../utils/logger.js';
import type { ProviderCtx } from '../../provider.js';
import { compositionProvider } from '../index.js';

const EXPECTED_DESCRIPTOR_COUNT = 3;

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

describe('compositionProvider — finish injection', () => {
  it('does not include finish for non-child agents', async () => {
    const built = await compositionProvider.buildTools({
      toolNames: ['invoke_agent'],
      ctx: makeCtx(),
    });
    expect(built.invoke_agent).toBeDefined();
    expect(built.finish).toBeUndefined();
  });

  it('always includes finish for child agents regardless of selection', async () => {
    const built = await compositionProvider.buildTools({
      toolNames: [],
      ctx: makeCtx({ isChildAgent: true }),
    });
    expect(built.finish).toBeDefined();
  });

  it('ignores finish in user-selected tools list (never user-gated)', async () => {
    const built = await compositionProvider.buildTools({
      toolNames: ['finish'],
      ctx: makeCtx(),
    });
    expect(built.finish).toBeUndefined();
  });
});

describe('compositionProvider — tool selection', () => {
  it('includes create_agent when selected', async () => {
    const built = await compositionProvider.buildTools({
      toolNames: ['create_agent'],
      ctx: makeCtx(),
    });
    expect(built.create_agent).toBeDefined();
  });

  it('includes invoke_workflow when selected', async () => {
    const built = await compositionProvider.buildTools({
      toolNames: ['invoke_workflow'],
      ctx: makeCtx(),
    });
    expect(built.invoke_workflow).toBeDefined();
  });

  it('returns three descriptors for user selection', async () => {
    const descriptors = await compositionProvider.describeTools(makeCtx());
    expect(descriptors).toHaveLength(EXPECTED_DESCRIPTOR_COUNT);
    const names = descriptors.map((d) => d.toolName);
    expect(names).toContain('create_agent');
    expect(names).toContain('invoke_agent');
    expect(names).toContain('invoke_workflow');
  });
});
