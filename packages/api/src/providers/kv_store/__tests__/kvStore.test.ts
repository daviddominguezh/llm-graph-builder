import { describe, expect, it, jest } from '@jest/globals';

import type { Logger } from '../../../utils/logger.js';
import type { ProviderCtx } from '../../provider.js';
import type { KvPagedResult, KvRegexArgs, KvSearchArgs, KvStoreServices } from '../../types.js';
import { kvStoreProvider } from '../index.js';

const TENANT_ID = 'test-tenant-id';
const STORE_ID = 'kv-1';
const ZERO = 0;
const TWENTY = 20;
const FIVE = 5;
const LIST_KEYS_DEFAULT_LIMIT = 100;
const EXPECTED_TOOL_COUNT = 4;

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

function makeServices(): KvStoreServices {
  const emptyStringPage: KvPagedResult<string> = { items: [], total: ZERO, offset: ZERO, limit: TWENTY };
  const emptyEntryPage: KvPagedResult<{ key: string; value: string }> = {
    items: [],
    total: ZERO,
    offset: ZERO,
    limit: TWENTY,
  };
  return {
    storeId: STORE_ID,
    listKeys: jest.fn<KvStoreServices['listKeys']>().mockResolvedValue(emptyStringPage),
    getValues: jest.fn<KvStoreServices['getValues']>().mockResolvedValue({}),
    searchSubstring: jest
      .fn<(args: KvSearchArgs) => Promise<KvPagedResult<{ key: string; value: string }>>>()
      .mockResolvedValue(emptyEntryPage),
    searchRegex: jest
      .fn<(args: KvRegexArgs) => Promise<KvPagedResult<{ key: string; value: string }>>>()
      .mockResolvedValue(emptyEntryPage),
    updateValue: jest.fn<KvStoreServices['updateValue']>().mockResolvedValue({ success: true }),
  };
}

function makeCtx(services?: KvStoreServices): ProviderCtx {
  return {
    orgId: 'o',
    tenantId: TENANT_ID,
    agentId: 'a',
    isChildAgent: false,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: (id: string) => (id === 'kv_store' ? services : undefined),
  };
}

describe('kvStoreProvider — metadata', () => {
  it('has correct id + type', () => {
    expect(kvStoreProvider.id).toBe('kv_store');
    expect(kvStoreProvider.type).toBe('builtin');
  });

  it('describes 4 tools', async () => {
    const result = await kvStoreProvider.describeTools(makeCtx());
    const tools = Array.isArray(result) ? result : result.tools;
    expect(tools.length).toBe(EXPECTED_TOOL_COUNT);
    const names = tools.map((t) => t.toolName);
    expect(names).toEqual(['list_keys', 'get_values', 'search', 'update_value']);
  });

  it('returns empty when no services bound', async () => {
    const built = await kvStoreProvider.buildTools({
      toolNames: ['list_keys'],
      ctx: makeCtx(undefined),
    });
    expect(built).toEqual({});
  });
});

describe('kvStoreProvider — list_keys', () => {
  it('invokes services.listKeys with defaults applied', async () => {
    const services = makeServices();
    const built = await kvStoreProvider.buildTools({
      toolNames: ['list_keys'],
      ctx: makeCtx(services),
    });
    const { list_keys: tool } = built;
    expect(tool).toBeDefined();
    if (tool === undefined) throw new Error('expected list_keys tool');
    await tool.execute({});
    expect(services.listKeys).toHaveBeenCalledWith(TENANT_ID, ZERO, LIST_KEYS_DEFAULT_LIMIT);
  });
});

describe('kvStoreProvider — search', () => {
  it('routes mode="substring" to searchSubstring', async () => {
    const services = makeServices();
    const built = await kvStoreProvider.buildTools({ toolNames: ['search'], ctx: makeCtx(services) });
    const { search: tool } = built;
    if (tool === undefined) throw new Error('expected search tool');
    await tool.execute({ mode: 'substring', query: 'q', limit: FIVE });
    expect(services.searchSubstring).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      on: 'both',
      query: 'q',
      offset: ZERO,
      limit: FIVE,
    });
  });

  it('routes mode="regex" to searchRegex', async () => {
    const services = makeServices();
    const built = await kvStoreProvider.buildTools({ toolNames: ['search'], ctx: makeCtx(services) });
    const { search: tool } = built;
    if (tool === undefined) throw new Error('expected search tool');
    await tool.execute({ mode: 'regex', query: 'foo', limit: FIVE });
    expect(services.searchRegex).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      on: 'both',
      pattern: 'foo',
      offset: ZERO,
      limit: FIVE,
    });
  });

  it('rejects search without a query', async () => {
    const services = makeServices();
    const built = await kvStoreProvider.buildTools({ toolNames: ['search'], ctx: makeCtx(services) });
    const { search: tool } = built;
    if (tool === undefined) throw new Error('expected search tool');
    await expect(tool.execute({ mode: 'substring' })).rejects.toBeDefined();
  });
});

describe('kvStoreProvider — update_value', () => {
  it('calls services.updateValue with tenantId, key, value', async () => {
    const services = makeServices();
    const built = await kvStoreProvider.buildTools({
      toolNames: ['update_value'],
      ctx: makeCtx(services),
    });
    const { update_value: tool } = built;
    if (tool === undefined) throw new Error('expected update_value tool');
    await tool.execute({ key: 'foo', value: 'bar' });
    expect(services.updateValue).toHaveBeenCalledWith(TENANT_ID, 'foo', 'bar');
  });
});
