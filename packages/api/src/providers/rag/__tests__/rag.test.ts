import { describe, expect, it, jest } from '@jest/globals';

import type { Logger } from '../../../utils/logger.js';
import type { ProviderCtx } from '../../provider.js';
import type {
  KvPagedResult,
  OpenFlowTool,
  RagRegexArgs,
  RagSearchArgs,
  RagStoreServices,
} from '../../types.js';
import { ragProvider } from '../index.js';

const TENANT_ID = 'test-tenant-id';
const STORE_ID = 'rag-1';
const ZERO = 0;
const TEN = 10;
const FIVE = 5;
const MIN_SIM = 0.7;
const DEFAULT_MIN_SIM = 0.5;

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

function makeServices(): RagStoreServices {
  const empty: KvPagedResult<string> = { items: [], total: ZERO, offset: ZERO, limit: TEN };
  return {
    storeId: STORE_ID,
    searchBm25: jest.fn<RagStoreServices['searchBm25']>().mockResolvedValue(empty),
    searchSemantic: jest
      .fn<(args: RagSearchArgs) => Promise<KvPagedResult<string>>>()
      .mockResolvedValue(empty),
    searchHybrid: jest.fn<(args: RagSearchArgs) => Promise<KvPagedResult<string>>>().mockResolvedValue(empty),
    searchRegex: jest.fn<(args: RagRegexArgs) => Promise<KvPagedResult<string>>>().mockResolvedValue(empty),
  };
}

function makeCtx(services?: RagStoreServices): ProviderCtx {
  return {
    orgId: 'o',
    tenantId: TENANT_ID,
    agentId: 'a',
    isChildAgent: false,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: (id: string) => (id === 'rag' ? services : undefined),
  };
}

describe('ragProvider — metadata', () => {
  it('has correct id + type', () => {
    expect(ragProvider.id).toBe('rag');
    expect(ragProvider.type).toBe('builtin');
  });

  it('describes 1 tool named search', async () => {
    const result = await ragProvider.describeTools(makeCtx());
    const tools = Array.isArray(result) ? result : result.tools;
    expect(tools.map((t) => t.toolName)).toEqual(['search']);
  });

  it('returns empty when no services bound', async () => {
    const built = await ragProvider.buildTools({ toolNames: ['search'], ctx: makeCtx(undefined) });
    expect(built).toEqual({});
  });
});

async function buildSearchTool(services: RagStoreServices): Promise<OpenFlowTool> {
  const built = await ragProvider.buildTools({ toolNames: ['search'], ctx: makeCtx(services) });
  const { search: tool } = built;
  if (tool === undefined) throw new Error('expected search tool');
  return tool;
}

describe('ragProvider — bm25', () => {
  it('routes bm25 to searchBm25', async () => {
    const services = makeServices();
    const tool = await buildSearchTool(services);
    await tool.execute({ mode: 'bm25', query: 'hello', limit: FIVE });
    expect(services.searchBm25).toHaveBeenCalledWith(TENANT_ID, 'hello', ZERO, FIVE);
  });

  it('rejects bm25 without a query', async () => {
    const services = makeServices();
    const tool = await buildSearchTool(services);
    await expect(tool.execute({ mode: 'bm25' })).rejects.toBeDefined();
  });
});

describe('ragProvider — semantic + hybrid', () => {
  it('routes semantic to searchSemantic', async () => {
    const services = makeServices();
    const tool = await buildSearchTool(services);
    await tool.execute({ mode: 'semantic', query: 'q', minSimilarity: MIN_SIM, limit: FIVE });
    expect(services.searchSemantic).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      query: 'q',
      minSimilarity: MIN_SIM,
      offset: ZERO,
      limit: FIVE,
    });
  });

  it('routes hybrid to searchHybrid', async () => {
    const services = makeServices();
    const tool = await buildSearchTool(services);
    await tool.execute({ mode: 'hybrid', query: 'q', limit: FIVE });
    expect(services.searchHybrid).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      query: 'q',
      minSimilarity: DEFAULT_MIN_SIM,
      offset: ZERO,
      limit: FIVE,
    });
  });
});

describe('ragProvider — regex', () => {
  it('routes regex to searchRegex', async () => {
    const services = makeServices();
    const tool = await buildSearchTool(services);
    await tool.execute({ mode: 'regex', query: 'foo', limit: FIVE });
    expect(services.searchRegex).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      pattern: 'foo',
      offset: ZERO,
      limit: FIVE,
    });
  });
});
