import { z } from 'zod';

import { simulatedNoop } from '../../runtime/simulatedNoop.js';
import type { ProviderCtx } from '../provider.js';
import type { KvStoreServices, OpenFlowTool } from '../types.js';
import { isKvStoreServices } from '../types.js';
import {
  CURSOR_DESC,
  GET_VALUES_KEYS_DESC,
  GET_VALUES_TOOL_DESC,
  LIST_KEYS_LIMIT_DESC,
  LIST_KEYS_TOOL_DESC,
  SEARCH_LIMIT_DESC,
  SEARCH_MODE_DESC,
  SEARCH_ON_DESC,
  SEARCH_QUERY_DESC,
  SEARCH_TOOL_DESC,
  UPDATE_KEY_DESC,
  UPDATE_VALUE_DESC,
  UPDATE_VALUE_TOOL_DESC,
} from './descriptions.js';
import {
  KV_GET_VALUES_TOOL_NAME,
  KV_LIST_KEYS_TOOL_NAME,
  KV_SEARCH_TOOL_NAME,
  KV_UPDATE_VALUE_TOOL_NAME,
} from './descriptors.js';

type KvToolName =
  | typeof KV_LIST_KEYS_TOOL_NAME
  | typeof KV_GET_VALUES_TOOL_NAME
  | typeof KV_SEARCH_TOOL_NAME
  | typeof KV_UPDATE_VALUE_TOOL_NAME;

const ONE_KILOBYTE = 1024;
const KEY_MAX_BYTES = 256;
const VALUE_MAX_BYTES = KEY_MAX_BYTES * ONE_KILOBYTE;
const KEY_PATTERN_MAX = ONE_KILOBYTE;
const QUERY_MAX = 2048;
const KEYS_MAX_ITEMS = 100;
const LIMIT_MIN = 1;
const LIMIT_MAX = 500;
const LIST_KEYS_DEFAULT_LIMIT = 100;
const SEARCH_DEFAULT_LIMIT = 50;

/* ─── Zod input schemas ─── */

const listKeysInput = z
  .object({
    cursor: z.string().optional().describe(CURSOR_DESC),
    limit: z
      .number()
      .int()
      .min(LIMIT_MIN)
      .max(LIMIT_MAX)
      .default(LIST_KEYS_DEFAULT_LIMIT)
      .describe(LIST_KEYS_LIMIT_DESC),
  })
  .describe(LIST_KEYS_TOOL_DESC);

const getValuesInput = z
  .object({
    keys: z.array(z.string().max(KEY_MAX_BYTES)).max(KEYS_MAX_ITEMS).describe(GET_VALUES_KEYS_DESC),
  })
  .describe(GET_VALUES_TOOL_DESC);

const searchInput = z
  .object({
    mode: z.enum(['substring', 'regex']).describe(SEARCH_MODE_DESC),
    on: z.enum(['keys', 'values', 'both']).default('both').describe(SEARCH_ON_DESC),
    query: z.string().min(LIMIT_MIN).max(QUERY_MAX).describe(SEARCH_QUERY_DESC),
    cursor: z.string().optional().describe(CURSOR_DESC),
    limit: z
      .number()
      .int()
      .min(LIMIT_MIN)
      .max(LIMIT_MAX)
      .default(SEARCH_DEFAULT_LIMIT)
      .describe(SEARCH_LIMIT_DESC),
  })
  // mode='regex' tightens the cap to bound ReDoS exposure on the RE2 path.
  .superRefine((val, ctx) => {
    if (val.mode === 'regex' && val.query.length > KEY_PATTERN_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['query'],
        message: `regex query exceeds ${KEY_PATTERN_MAX} chars`,
      });
    }
  })
  .describe(SEARCH_TOOL_DESC);

const updateValueInput = z
  .object({
    key: z.string().min(LIMIT_MIN).max(KEY_MAX_BYTES).describe(UPDATE_KEY_DESC),
    value: z.string().max(VALUE_MAX_BYTES).describe(UPDATE_VALUE_DESC),
  })
  .describe(UPDATE_VALUE_TOOL_DESC);

/* ─── Tool execute helpers ─── */

interface KvToolCtx {
  services: KvStoreServices;
  tenantId: string;
}

function parseArgs<S extends z.ZodType>(schema: S, args: unknown): z.infer<S> {
  return schema.parse(args);
}

async function executeListKeys(ctx: KvToolCtx, args: unknown): Promise<unknown> {
  const input = parseArgs(listKeysInput, args);
  return await ctx.services.listKeys(ctx.tenantId, input.limit, input.cursor);
}

async function executeGetValues(ctx: KvToolCtx, args: unknown): Promise<unknown> {
  const input = parseArgs(getValuesInput, args);
  return await ctx.services.getValues(ctx.tenantId, input.keys);
}

async function executeSearchSubstring(ctx: KvToolCtx, input: z.infer<typeof searchInput>): Promise<unknown> {
  return await ctx.services.searchSubstring({
    tenantId: ctx.tenantId,
    on: input.on,
    query: input.query,
    cursor: input.cursor,
    limit: input.limit,
  });
}

async function executeSearchRegex(ctx: KvToolCtx, input: z.infer<typeof searchInput>): Promise<unknown> {
  return await ctx.services.searchRegex({
    tenantId: ctx.tenantId,
    on: input.on,
    pattern: input.query,
    cursor: input.cursor,
    limit: input.limit,
  });
}

async function executeSearch(ctx: KvToolCtx, args: unknown): Promise<unknown> {
  const input = parseArgs(searchInput, args);
  if (input.mode === 'regex') return await executeSearchRegex(ctx, input);
  return await executeSearchSubstring(ctx, input);
}

async function executeUpdateValue(ctx: KvToolCtx, args: unknown): Promise<unknown> {
  const input = parseArgs(updateValueInput, args);
  return await ctx.services.updateValue(ctx.tenantId, input.key, input.value);
}

/* ─── Tool factory ─── */

function makeListKeys(ctx: KvToolCtx): OpenFlowTool {
  return {
    description: LIST_KEYS_TOOL_DESC,
    inputSchema: listKeysInput,
    execute: async (args: unknown) => await executeListKeys(ctx, args),
  };
}

function makeGetValues(ctx: KvToolCtx): OpenFlowTool {
  return {
    description: GET_VALUES_TOOL_DESC,
    inputSchema: getValuesInput,
    execute: async (args: unknown) => await executeGetValues(ctx, args),
  };
}

function makeSearch(ctx: KvToolCtx): OpenFlowTool {
  return {
    description: SEARCH_TOOL_DESC,
    inputSchema: searchInput,
    execute: async (args: unknown) => await executeSearch(ctx, args),
  };
}

function makeUpdateValue(ctx: KvToolCtx): OpenFlowTool {
  return {
    description: UPDATE_VALUE_TOOL_DESC,
    inputSchema: updateValueInput,
    execute: async (args: unknown) => await executeUpdateValue(ctx, args),
  };
}

function buildAll(ctx: KvToolCtx): Record<KvToolName, OpenFlowTool> {
  return {
    [KV_LIST_KEYS_TOOL_NAME]: makeListKeys(ctx),
    [KV_GET_VALUES_TOOL_NAME]: makeGetValues(ctx),
    [KV_SEARCH_TOOL_NAME]: makeSearch(ctx),
    [KV_UPDATE_VALUE_TOOL_NAME]: makeUpdateValue(ctx),
  };
}

const KV_TOOL_NAMES: readonly string[] = [
  KV_LIST_KEYS_TOOL_NAME,
  KV_GET_VALUES_TOOL_NAME,
  KV_SEARCH_TOOL_NAME,
  KV_UPDATE_VALUE_TOOL_NAME,
];

function isKvToolName(s: string): s is KvToolName {
  return KV_TOOL_NAMES.includes(s);
}

// Simulation short-circuits before touching the real KV service. The guard is
// keyed on the positive `=== 'simulation'` check so an env-less (undefined)
// production ctx still runs the real path.
function withSimGuard(ctx: ProviderCtx, tool: OpenFlowTool): OpenFlowTool {
  return {
    description: tool.description,
    inputSchema: tool.inputSchema,
    execute: async (args: unknown) => {
      if (ctx.environment === 'simulation') return await simulatedNoop(args, ctx);
      return await tool.execute(args);
    },
  };
}

function pickTools(
  ctx: ProviderCtx,
  all: Record<KvToolName, OpenFlowTool>,
  names: string[]
): Partial<Record<KvToolName, OpenFlowTool>> {
  const out: Partial<Record<KvToolName, OpenFlowTool>> = {};
  for (const name of names) {
    if (!isKvToolName(name)) continue;
    const { [name]: tool } = all;
    out[name] = withSimGuard(ctx, tool);
  }
  return out;
}

function narrowServices(ctx: ProviderCtx): KvStoreServices | undefined {
  const raw = ctx.services('kv_store');
  return isKvStoreServices(raw) ? raw : undefined;
}

function buildToolsSync(toolNames: string[], ctx: ProviderCtx): Partial<Record<KvToolName, OpenFlowTool>> {
  const services = narrowServices(ctx);
  if (services === undefined) return {};
  const toolCtx: KvToolCtx = { services, tenantId: ctx.tenantId };
  return pickTools(ctx, buildAll(toolCtx), toolNames);
}

export async function buildKvTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Partial<Record<KvToolName, OpenFlowTool>>> {
  const { toolNames, ctx } = args;
  return await Promise.resolve(buildToolsSync(toolNames, ctx));
}
