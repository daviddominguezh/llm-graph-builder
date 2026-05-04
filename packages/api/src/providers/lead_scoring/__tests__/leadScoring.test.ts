import { describe, expect, it, jest } from '@jest/globals';

import type { Logger } from '../../../utils/logger.js';
import type { ProviderCtx } from '../../provider.js';
import { leadScoringProvider } from '../index.js';

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
    orgId: 'o',
    agentId: 'a',
    isChildAgent: false,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: () => undefined,
  };
}

describe('leadScoringProvider', () => {
  it('describes set_lead_score and get_lead_score', async () => {
    const tools = await leadScoringProvider.describeTools(makeCtx());
    const names = tools.map((t) => t.toolName);
    expect(names).toContain('set_lead_score');
    expect(names).toContain('get_lead_score');
  });

  it('returns empty when no lead_scoring service in ctx', async () => {
    const built = await leadScoringProvider.buildTools({
      toolNames: ['set_lead_score'],
      ctx: makeCtx(),
    });
    expect(built).toEqual({});
  });
});
