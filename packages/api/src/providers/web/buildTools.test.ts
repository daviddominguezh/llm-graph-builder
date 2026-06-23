import { describe, expect, it } from '@jest/globals';

import type { ProviderCtx } from '../provider.js';
import { buildWebTools } from './buildTools.js';
import type { WebSearchService } from './types.js';

const CREDITS = 1;
const MAX_RESULTS = 3;

function fakeService(): { service: WebSearchService; calls: unknown[] } {
  const calls: unknown[] = [];
  const record = (name: string) => async (input: unknown) => {
    calls.push({ name, input });
    return await Promise.resolve({ ok: name, usage: { credits: CREDITS } });
  };
  return {
    calls,
    service: {
      search: record('search'),
      extract: record('extract'),
      crawl: record('crawl'),
      map: record('map'),
    },
  };
}

function silentLogger(): ProviderCtx['logger'] {
  const noop = (): void => undefined;
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
  };
}

function ctxWith(serviceBundle: unknown): ProviderCtx {
  return {
    orgId: 'o',
    tenantId: 't',
    agentId: 'a',
    isChildAgent: false,
    logger: silentLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: ((id: string) => (id === 'web' ? serviceBundle : undefined)) as ProviderCtx['services'],
  };
}

describe('buildWebTools', () => {
  it('builds the requested tools and forwards validated args verbatim', async () => {
    const { service, calls } = fakeService();
    const tools = await buildWebTools({ toolNames: ['search'], ctx: ctxWith({ service }) });
    expect(Object.keys(tools)).toEqual(['search']);
    const result = await tools.search?.execute({ query: 'hi', max_results: MAX_RESULTS });
    expect(result).toEqual({ ok: 'search', usage: { credits: CREDITS } });
    expect(calls).toEqual([{ name: 'search', input: { query: 'hi', max_results: MAX_RESULTS } }]);
  });

  it('returns an empty map when no web service is bound', async () => {
    const tools = await buildWebTools({ toolNames: ['search', 'extract'], ctx: ctxWith(undefined) });
    expect(tools).toEqual({});
  });

  it('rejects invalid args via the zod schema', async () => {
    const { service } = fakeService();
    const tools = await buildWebTools({ toolNames: ['search'], ctx: ctxWith({ service }) });
    await expect(tools.search?.execute({})).rejects.toThrow();
  });
});
