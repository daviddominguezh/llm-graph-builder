import { z } from 'zod';

import { simulatedNoop } from '../../runtime/simulatedNoop.js';
import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool, RagStoreServices } from '../types.js';
import { isRagStoreServices } from '../types.js';
import {
  RAG_CURSOR_DESC,
  RAG_LIMIT_DESC,
  RAG_MIN_SIMILARITY_DESC,
  RAG_MODE_DESC,
  RAG_QUERY_DESC,
  RAG_SEARCH_TOOL_DESC,
} from './descriptions.js';
import { RAG_SEARCH_TOOL_NAME } from './descriptors.js';

type RagToolName = typeof RAG_SEARCH_TOOL_NAME;

const ONE_KILOBYTE = 1024;
const QUERY_MAX = 4096;
const LIMIT_MIN = 1;
const LIMIT_MAX = 200;
const DEFAULT_LIMIT = 20;
const MIN_SIMILARITY_FLOOR = 0;
const MIN_SIMILARITY_CEIL = 1;
const DEFAULT_MIN_SIMILARITY = 0.5;

const searchInput = z
  .object({
    mode: z.enum(['bm25', 'semantic', 'hybrid', 'regex']).describe(RAG_MODE_DESC),
    query: z.string().min(LIMIT_MIN).max(QUERY_MAX).describe(RAG_QUERY_DESC),
    minSimilarity: z
      .number()
      .min(MIN_SIMILARITY_FLOOR)
      .max(MIN_SIMILARITY_CEIL)
      .default(DEFAULT_MIN_SIMILARITY)
      .describe(RAG_MIN_SIMILARITY_DESC),
    cursor: z.string().optional().describe(RAG_CURSOR_DESC),
    limit: z.number().int().min(LIMIT_MIN).max(LIMIT_MAX).default(DEFAULT_LIMIT).describe(RAG_LIMIT_DESC),
  })
  // mode='regex' tightens the cap to bound ReDoS exposure on the POSIX path.
  .superRefine((val, ctx) => {
    if (val.mode === 'regex' && val.query.length > ONE_KILOBYTE) {
      ctx.addIssue({
        code: 'custom',
        path: ['query'],
        message: `regex query exceeds ${ONE_KILOBYTE} chars`,
      });
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
  return await ctx.services.searchBm25(ctx.tenantId, input.query, input.limit, input.cursor);
}

async function executeSemantic(ctx: RagToolCtx, input: SearchInput): Promise<unknown> {
  return await ctx.services.searchSemantic({
    tenantId: ctx.tenantId,
    query: input.query,
    minSimilarity: input.minSimilarity,
    cursor: input.cursor,
    limit: input.limit,
  });
}

async function executeHybrid(ctx: RagToolCtx, input: SearchInput): Promise<unknown> {
  return await ctx.services.searchHybrid({
    tenantId: ctx.tenantId,
    query: input.query,
    minSimilarity: input.minSimilarity,
    cursor: input.cursor,
    limit: input.limit,
  });
}

async function executeRegex(ctx: RagToolCtx, input: SearchInput): Promise<unknown> {
  return await ctx.services.searchRegex({
    tenantId: ctx.tenantId,
    pattern: input.query,
    cursor: input.cursor,
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

function buildAll(ctx: RagToolCtx): Record<RagToolName, OpenFlowTool> {
  return { [RAG_SEARCH_TOOL_NAME]: makeSearch(ctx) };
}

const RAG_TOOL_NAMES: readonly string[] = [RAG_SEARCH_TOOL_NAME];

function isRagToolName(s: string): s is RagToolName {
  return RAG_TOOL_NAMES.includes(s);
}

// Simulation short-circuits before touching the real RAG service. The guard is
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
  all: Record<RagToolName, OpenFlowTool>,
  names: string[]
): Partial<Record<RagToolName, OpenFlowTool>> {
  const out: Partial<Record<RagToolName, OpenFlowTool>> = {};
  for (const name of names) {
    if (!isRagToolName(name)) continue;
    const { [name]: tool } = all;
    out[name] = withSimGuard(ctx, tool);
  }
  return out;
}

function narrowServices(ctx: ProviderCtx): RagStoreServices | undefined {
  const raw = ctx.services('rag');
  return isRagStoreServices(raw) ? raw : undefined;
}

function buildToolsSync(toolNames: string[], ctx: ProviderCtx): Partial<Record<RagToolName, OpenFlowTool>> {
  const services = narrowServices(ctx);
  if (services === undefined) return {};
  const toolCtx: RagToolCtx = { services, tenantId: ctx.tenantId };
  return pickTools(ctx, buildAll(toolCtx), toolNames);
}

export async function buildRagTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Partial<Record<RagToolName, OpenFlowTool>>> {
  const { toolNames, ctx } = args;
  return await Promise.resolve(buildToolsSync(toolNames, ctx));
}
