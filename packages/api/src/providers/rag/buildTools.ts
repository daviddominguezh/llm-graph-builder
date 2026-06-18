import { z } from 'zod';

import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool, RagStoreServices } from '../types.js';
import { isRagStoreServices } from '../types.js';
import {
  RAG_LIMIT_DESC,
  RAG_MIN_SIMILARITY_DESC,
  RAG_MODE_DESC,
  RAG_OFFSET_DESC,
  RAG_PATTERN_DESC,
  RAG_QUERY_DESC,
  RAG_SEARCH_TOOL_DESC,
} from './descriptions.js';
import { RAG_SEARCH_TOOL_NAME } from './descriptors.js';

const ONE_KILOBYTE = 1024;
const QUERY_MAX = 4096;
const OFFSET_MIN = 0;
const LIMIT_MIN = 1;
const LIMIT_MAX = 200;
const DEFAULT_LIMIT = 20;
const MIN_SIMILARITY_FLOOR = 0;
const MIN_SIMILARITY_CEIL = 1;
const DEFAULT_MIN_SIMILARITY = 0.5;

const searchInput = z
  .object({
    mode: z.enum(['bm25', 'semantic', 'hybrid', 'regex']).describe(RAG_MODE_DESC),
    query: z.string().min(LIMIT_MIN).max(QUERY_MAX).optional().describe(RAG_QUERY_DESC),
    pattern: z.string().max(ONE_KILOBYTE).optional().describe(RAG_PATTERN_DESC),
    minSimilarity: z
      .number()
      .min(MIN_SIMILARITY_FLOOR)
      .max(MIN_SIMILARITY_CEIL)
      .default(DEFAULT_MIN_SIMILARITY)
      .describe(RAG_MIN_SIMILARITY_DESC),
    offset: z.number().int().min(OFFSET_MIN).default(OFFSET_MIN).describe(RAG_OFFSET_DESC),
    limit: z.number().int().min(LIMIT_MIN).max(LIMIT_MAX).default(DEFAULT_LIMIT).describe(RAG_LIMIT_DESC),
  })
  .superRefine((val, ctx) => {
    const textModes = ['bm25', 'semantic', 'hybrid'];
    if (textModes.includes(val.mode) && (val.query === undefined || val.query === '')) {
      ctx.addIssue({ code: 'custom', message: `query is required when mode="${val.mode}"` });
    }
    if (val.mode === 'regex' && (val.pattern === undefined || val.pattern === '')) {
      ctx.addIssue({ code: 'custom', message: 'pattern is required when mode="regex"' });
    }
  })
  .describe(RAG_SEARCH_TOOL_DESC);

interface RagToolCtx {
  services: RagStoreServices;
  tenantId: string;
}

function parseArgs<S extends z.ZodType>(schema: S, args: unknown): z.infer<S> {
  return schema.parse(args);
}

type SearchInput = z.infer<typeof searchInput>;

async function executeBm25(ctx: RagToolCtx, input: SearchInput): Promise<unknown> {
  return await ctx.services.searchBm25(ctx.tenantId, input.query ?? '', input.offset, input.limit);
}

async function executeSemantic(ctx: RagToolCtx, input: SearchInput): Promise<unknown> {
  return await ctx.services.searchSemantic({
    tenantId: ctx.tenantId,
    query: input.query ?? '',
    minSimilarity: input.minSimilarity,
    offset: input.offset,
    limit: input.limit,
  });
}

async function executeHybrid(ctx: RagToolCtx, input: SearchInput): Promise<unknown> {
  return await ctx.services.searchHybrid({
    tenantId: ctx.tenantId,
    query: input.query ?? '',
    minSimilarity: input.minSimilarity,
    offset: input.offset,
    limit: input.limit,
  });
}

async function executeRegex(ctx: RagToolCtx, input: SearchInput): Promise<unknown> {
  return await ctx.services.searchRegex({
    tenantId: ctx.tenantId,
    pattern: input.pattern ?? '',
    offset: input.offset,
    limit: input.limit,
  });
}

async function executeSearch(ctx: RagToolCtx, args: unknown): Promise<unknown> {
  const input = parseArgs(searchInput, args);
  if (input.mode === 'bm25') return await executeBm25(ctx, input);
  if (input.mode === 'semantic') return await executeSemantic(ctx, input);
  if (input.mode === 'hybrid') return await executeHybrid(ctx, input);
  return await executeRegex(ctx, input);
}

function makeSearch(ctx: RagToolCtx): OpenFlowTool {
  return {
    description: RAG_SEARCH_TOOL_DESC,
    inputSchema: searchInput,
    execute: async (args: unknown) => await executeSearch(ctx, args),
  };
}

function buildAll(ctx: RagToolCtx): Record<string, OpenFlowTool> {
  return { [RAG_SEARCH_TOOL_NAME]: makeSearch(ctx) };
}

function pickTools(all: Record<string, OpenFlowTool>, names: string[]): Record<string, OpenFlowTool> {
  const out: Record<string, OpenFlowTool> = {};
  for (const name of names) {
    const { [name]: tool } = all;
    if (tool !== undefined) out[name] = tool;
  }
  return out;
}

function narrowServices(ctx: ProviderCtx): RagStoreServices | undefined {
  const raw = ctx.services('rag');
  return isRagStoreServices(raw) ? raw : undefined;
}

function buildToolsSync(toolNames: string[], ctx: ProviderCtx): Record<string, OpenFlowTool> {
  const services = narrowServices(ctx);
  if (services === undefined) return {};
  const toolCtx: RagToolCtx = { services, tenantId: ctx.tenantId };
  return pickTools(buildAll(toolCtx), toolNames);
}

export async function buildRagTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Record<string, OpenFlowTool>> {
  const { toolNames, ctx } = args;
  return await Promise.resolve(buildToolsSync(toolNames, ctx));
}
