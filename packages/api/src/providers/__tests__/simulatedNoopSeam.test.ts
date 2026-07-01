import { describe, expect, it, jest } from '@jest/globals';

import type { Logger } from '../../utils/logger.js';
import { buildFormsTools } from '../forms/buildTools.js';
import { buildKvTools } from '../kv_store/buildTools.js';
import { buildLeadScoringTools } from '../lead_scoring/buildTools.js';
import type { ProviderCtx, ServicesResolver } from '../provider.js';
import { buildRagTools } from '../rag/buildTools.js';
import type { OpenFlowTool } from '../types.js';
import { buildWebTools } from '../web/buildTools.js';

const MARKER = { simulated: true };
type ToolMap = Partial<Record<string, OpenFlowTool>>;
type Env = 'production' | 'simulation';

const DISPATCH_DEPTH = 0;
const LIST_LIMIT = 10;
const FIELD_VALUE = 1;
const LEAD_SCORE = 50;
const CALLED_ONCE = 1;

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

function makeCtx(environment: Env, services: ServicesResolver): ProviderCtx {
  const base = {
    orgId: 'o',
    tenantId: 't',
    agentId: 'a',
    isChildAgent: false,
    dispatchDepth: DISPATCH_DEPTH,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    conversationId: 'c',
    services,
  };
  if (environment === 'simulation') {
    return { ...base, environment, simulationState: {}, writeSimulationState: () => undefined };
  }
  return { ...base, environment };
}

function resolver(bundle: unknown): ServicesResolver {
  return (() => bundle) as ServicesResolver;
}

interface Seam {
  provider: string;
  makeBundle: (probe: jest.Mock) => unknown;
  build: (ctx: ProviderCtx, name: string) => Promise<ToolMap>;
  toolName: string;
  args: unknown;
}

const emptyPage = { items: [], cursor: undefined };
const stub = (value: unknown): jest.Mock => jest.fn(async () => await Promise.resolve(value));

function kvBundle(probe: jest.Mock): unknown {
  return {
    storeId: 's',
    listKeys: probe,
    getValues: stub({}),
    searchSubstring: stub(emptyPage),
    searchRegex: stub(emptyPage),
    updateValue: stub({ success: true }),
  };
}

function ragBundle(probe: jest.Mock): unknown {
  return {
    storeId: 's',
    searchBm25: probe,
    searchSemantic: stub(emptyPage),
    searchHybrid: stub(emptyPage),
    searchRegex: stub(emptyPage),
  };
}

function formsBundle(probe: jest.Mock): unknown {
  const form = {
    id: 'f1',
    agentId: 'a',
    displayName: 'Contact',
    formSlug: 'contact',
    schemaId: 'sc',
    schemaFields: [],
    validations: {},
  };
  return {
    forms: [form],
    service: {
      getFormDefinitions: stub([form]),
      getFormData: stub(undefined),
      applyFormFieldsAtomic: probe,
      recordFailedAttempt: stub(undefined),
    },
  };
}

function leadBundle(probe: jest.Mock): unknown {
  return { service: { setLeadScore: probe, getLeadScore: stub(null) } };
}

function webBundle(probe: jest.Mock): unknown {
  return {
    service: { search: probe, extract: stub({}), crawl: stub({}), map: stub({}) },
  };
}

const seams: Seam[] = [
  {
    provider: 'kv_store',
    makeBundle: kvBundle,
    build: async (ctx, name) => await buildKvTools({ toolNames: [name], ctx }),
    toolName: 'list_keys',
    args: { limit: LIST_LIMIT },
  },
  {
    provider: 'rag',
    makeBundle: ragBundle,
    build: async (ctx, name) => await buildRagTools({ toolNames: [name], ctx }),
    toolName: 'search',
    args: { mode: 'bm25', query: 'hello' },
  },
  {
    provider: 'forms',
    makeBundle: formsBundle,
    build: async (ctx, name) => await buildFormsTools({ toolNames: [name], ctx }),
    toolName: 'set_form_fields',
    args: { formSlug: 'contact', fields: [{ fieldPath: 'a', fieldValue: FIELD_VALUE }] },
  },
  {
    provider: 'lead_scoring',
    makeBundle: leadBundle,
    build: async (ctx, name) => await buildLeadScoringTools({ toolNames: [name], ctx }),
    toolName: 'set_lead_score',
    args: { score: LEAD_SCORE },
  },
  {
    provider: 'web',
    makeBundle: webBundle,
    build: async (ctx, name) => await buildWebTools({ toolNames: [name], ctx }),
    toolName: 'search',
    args: { query: 'hello' },
  },
];

function probeReturn(provider: string): unknown {
  if (provider === 'kv_store' || provider === 'rag') return emptyPage;
  if (provider === 'forms') return { ok: true, newData: {}, results: [] };
  if (provider === 'lead_scoring') return undefined;
  return { real: true };
}

describe('simulatedNoop seam across builtins', () => {
  for (const seam of seams) {
    it(`${seam.provider}/${seam.toolName} no-ops in simulation`, async () => {
      const probe = stub(probeReturn(seam.provider));
      const ctx = makeCtx('simulation', resolver(seam.makeBundle(probe)));
      const tools = await seam.build(ctx, seam.toolName);
      const { [seam.toolName]: tool } = tools;
      expect(tool).toBeDefined();
      if (tool === undefined) return;
      const out = await tool.execute(seam.args);
      expect(out).toEqual(MARKER);
      expect(probe).not.toHaveBeenCalled();
    });

    it(`${seam.provider}/${seam.toolName} takes the real path in production`, async () => {
      const probe = stub(probeReturn(seam.provider));
      const ctx = makeCtx('production', resolver(seam.makeBundle(probe)));
      const tools = await seam.build(ctx, seam.toolName);
      const { [seam.toolName]: tool } = tools;
      expect(tool).toBeDefined();
      if (tool === undefined) return;
      const out = await tool.execute(seam.args);
      expect(out).not.toEqual(MARKER);
      expect(probe).toHaveBeenCalledTimes(CALLED_ONCE);
    });
  }
});
