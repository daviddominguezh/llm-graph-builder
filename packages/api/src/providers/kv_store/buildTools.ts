import { z } from 'zod';

import type { ProviderCtx } from '../provider.js';
import type { KvStoreServices, OpenFlowTool } from '../types.js';
import { isKvStoreServices } from '../types.js';
import {
  KV_GET_VALUES_TOOL_NAME,
  KV_LIST_KEYS_TOOL_NAME,
  KV_SEARCH_TOOL_NAME,
  KV_UPDATE_VALUE_TOOL_NAME,
} from './descriptors.js';

const ONE_KILOBYTE = 1024;
const KEY_MAX_BYTES = 256;
const VALUE_MAX_BYTES = KEY_MAX_BYTES * ONE_KILOBYTE;
const KEY_PATTERN_MAX = ONE_KILOBYTE;
const QUERY_MAX = 2048;
const KEYS_MAX_ITEMS = 100;
const OFFSET_MIN = 0;
const LIMIT_MIN = 1;
const LIMIT_MAX = 500;
const LIST_KEYS_DEFAULT_LIMIT = 100;
const SEARCH_DEFAULT_LIMIT = 50;

/* ─── Zod input schemas ─── */

const listKeysInput = z.object({
  offset: z.number().int().min(OFFSET_MIN).default(OFFSET_MIN),
  limit: z.number().int().min(LIMIT_MIN).max(LIMIT_MAX).default(LIST_KEYS_DEFAULT_LIMIT),
});

const getValuesInput = z.object({
  keys: z.array(z.string().max(KEY_MAX_BYTES)).max(KEYS_MAX_ITEMS),
});

const searchInput = z
  .object({
    mode: z.enum(['substring', 'regex']),
    on: z.enum(['keys', 'values', 'both']).default('both'),
    query: z.string().min(LIMIT_MIN).max(QUERY_MAX).optional(),
    pattern: z.string().max(KEY_PATTERN_MAX).optional(),
    offset: z.number().int().min(OFFSET_MIN).default(OFFSET_MIN),
    limit: z.number().int().min(LIMIT_MIN).max(LIMIT_MAX).default(SEARCH_DEFAULT_LIMIT),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'substring' && (val.query === undefined || val.query === '')) {
      ctx.addIssue({ code: 'custom', message: 'query is required when mode="substring"' });
    }
    if (val.mode === 'regex' && (val.pattern === undefined || val.pattern === '')) {
      ctx.addIssue({ code: 'custom', message: 'pattern is required when mode="regex"' });
    }
  });

const updateValueInput = z.object({
  key: z.string().min(LIMIT_MIN).max(KEY_MAX_BYTES),
  value: z.string().max(VALUE_MAX_BYTES),
});

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
  return await ctx.services.listKeys(ctx.tenantId, input.offset, input.limit);
}

async function executeGetValues(ctx: KvToolCtx, args: unknown): Promise<unknown> {
  const input = parseArgs(getValuesInput, args);
  return await ctx.services.getValues(ctx.tenantId, input.keys);
}

async function executeSearchSubstring(ctx: KvToolCtx, input: z.infer<typeof searchInput>): Promise<unknown> {
  return await ctx.services.searchSubstring({
    tenantId: ctx.tenantId,
    on: input.on,
    query: input.query ?? '',
    offset: input.offset,
    limit: input.limit,
  });
}

async function executeSearchRegex(ctx: KvToolCtx, input: z.infer<typeof searchInput>): Promise<unknown> {
  return await ctx.services.searchRegex({
    tenantId: ctx.tenantId,
    on: input.on,
    pattern: input.pattern ?? '',
    offset: input.offset,
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
    description: 'List keys in the bound KV store (paginated).',
    inputSchema: listKeysInput,
    execute: async (args: unknown) => await executeListKeys(ctx, args),
  };
}

function makeGetValues(ctx: KvToolCtx): OpenFlowTool {
  return {
    description: 'Get values for an explicit set of keys.',
    inputSchema: getValuesInput,
    execute: async (args: unknown) => await executeGetValues(ctx, args),
  };
}

function makeSearch(ctx: KvToolCtx): OpenFlowTool {
  return {
    description: 'Search KV entries by substring or POSIX regex.',
    inputSchema: searchInput,
    execute: async (args: unknown) => await executeSearch(ctx, args),
  };
}

function makeUpdateValue(ctx: KvToolCtx): OpenFlowTool {
  return {
    description: 'Insert or update a value for a key.',
    inputSchema: updateValueInput,
    execute: async (args: unknown) => await executeUpdateValue(ctx, args),
  };
}

function buildAll(ctx: KvToolCtx): Record<string, OpenFlowTool> {
  return {
    [KV_LIST_KEYS_TOOL_NAME]: makeListKeys(ctx),
    [KV_GET_VALUES_TOOL_NAME]: makeGetValues(ctx),
    [KV_SEARCH_TOOL_NAME]: makeSearch(ctx),
    [KV_UPDATE_VALUE_TOOL_NAME]: makeUpdateValue(ctx),
  };
}

function pickTools(all: Record<string, OpenFlowTool>, names: string[]): Record<string, OpenFlowTool> {
  const out: Record<string, OpenFlowTool> = {};
  for (const name of names) {
    const { [name]: tool } = all;
    if (tool !== undefined) out[name] = tool;
  }
  return out;
}

function narrowServices(ctx: ProviderCtx): KvStoreServices | undefined {
  const raw = ctx.services('kv_store');
  return isKvStoreServices(raw) ? raw : undefined;
}

function buildToolsSync(toolNames: string[], ctx: ProviderCtx): Record<string, OpenFlowTool> {
  const services = narrowServices(ctx);
  if (services === undefined) return {};
  const toolCtx: KvToolCtx = { services, tenantId: ctx.tenantId };
  return pickTools(buildAll(toolCtx), toolNames);
}

export async function buildKvTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Record<string, OpenFlowTool>> {
  const { toolNames, ctx } = args;
  return await Promise.resolve(buildToolsSync(toolNames, ctx));
}
