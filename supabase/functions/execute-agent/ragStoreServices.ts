// Deno-side RagStoreServices factory. Talks to Postgres (via supabase-js
// RPCs) for the actual search; bounces to `/internal/embed` and
// `/internal/regex/validate` for the two Node-only helpers (Vertex AI auth
// and RE2 pre-validation).
import type { KvPagedResult, RagRegexArgs, RagSearchArgs, RagStoreServices } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  runHybridSearch,
  runRegexSearch,
  runSemanticSearch,
  runSimpleSearch,
} from './ragSearchCores.ts';

interface Ctx {
  supabase: SupabaseClient;
  storeId: string;
}

async function doBm25(
  ctx: Ctx,
  tenantId: string,
  query: string,
  offset: number,
  limit: number
): Promise<KvPagedResult<string>> {
  return await runSimpleSearch(ctx.supabase, {
    storeId: ctx.storeId,
    tenantId,
    query,
    offset,
    limit,
  });
}

async function doSemantic(ctx: Ctx, args: RagSearchArgs): Promise<KvPagedResult<string>> {
  return await runSemanticSearch(ctx.supabase, {
    storeId: ctx.storeId,
    tenantId: args.tenantId,
    query: args.query,
    minSimilarity: args.minSimilarity,
    offset: args.offset,
    limit: args.limit,
  });
}

async function doHybrid(ctx: Ctx, args: RagSearchArgs): Promise<KvPagedResult<string>> {
  return await runHybridSearch(ctx.supabase, {
    storeId: ctx.storeId,
    tenantId: args.tenantId,
    query: args.query,
    minSimilarity: args.minSimilarity,
    offset: args.offset,
    limit: args.limit,
  });
}

async function doRegex(ctx: Ctx, args: RagRegexArgs): Promise<KvPagedResult<string>> {
  return await runRegexSearch(ctx.supabase, {
    storeId: ctx.storeId,
    tenantId: args.tenantId,
    pattern: args.pattern,
    offset: args.offset,
    limit: args.limit,
  });
}

export function makeRagStoreService(supabase: SupabaseClient, storeId: string): RagStoreServices {
  const ctx: Ctx = { supabase, storeId };
  return {
    storeId,
    searchBm25: async (tenantId, query, offset, limit) =>
      await doBm25(ctx, tenantId, query, offset, limit),
    searchSemantic: async (args) => await doSemantic(ctx, args),
    searchHybrid: async (args) => await doHybrid(ctx, args),
    searchRegex: async (args) => await doRegex(ctx, args),
  };
}
