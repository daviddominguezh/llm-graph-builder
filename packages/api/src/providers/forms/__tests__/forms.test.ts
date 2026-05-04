import { describe, expect, it, jest } from '@jest/globals';

import type { Logger } from '../../../utils/logger.js';
import type { ProviderCtx } from '../../provider.js';
import { formsProvider } from '../index.js';

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

function makeBaseCtx(): ProviderCtx {
  return {
    orgId: 'o',
    agentId: 'a',
    isChildAgent: false,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: () => undefined,
  };
}

function makeCtxWithSvcButNoConv(): ProviderCtx {
  return {
    orgId: 'o',
    agentId: 'a',
    isChildAgent: false,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: () => ({ service: {}, forms: [] }),
  };
}

describe('formsProvider', () => {
  it('describes set_form_fields and get_form_field', async () => {
    const tools = await formsProvider.describeTools(makeBaseCtx());
    const names = tools.map((t) => t.toolName);
    expect(names).toContain('set_form_fields');
    expect(names).toContain('get_form_field');
  });

  it('returns empty when no forms service in ctx', async () => {
    const built = await formsProvider.buildTools({
      toolNames: ['set_form_fields'],
      ctx: makeBaseCtx(),
    });
    expect(built).toEqual({});
  });

  it('returns empty when conversationId is missing', async () => {
    const built = await formsProvider.buildTools({
      toolNames: ['set_form_fields'],
      ctx: makeCtxWithSvcButNoConv(),
    });
    expect(built).toEqual({});
  });
});
