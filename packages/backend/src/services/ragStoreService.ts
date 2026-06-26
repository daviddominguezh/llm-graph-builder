import type { KvPagedResult, RagRegexArgs, RagSearchArgs, RagStoreServices } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

import { runHybridSearch } from '../rag/search/hybrid.js';
import { runRegexSearch } from '../rag/search/regex.js';
import { runSemanticSearch } from '../rag/search/semantic.js';
import { runSimpleSearch } from '../rag/search/simple.js';

interface ServiceContext {
  supabase: SupabaseClient;
  storeId: string;
}

interface Bm25Args {
  tenantId: string;
  query: string;
  offset: number;
  limit: number;
}

async function doBm25(ctx: ServiceContext, args: Bm25Args): Promise<KvPagedResult<string>> {
  return await runSimpleSearch(ctx.supabase, {
    storeId: ctx.storeId,
    tenantId: args.tenantId,
    query: args.query,
    offset: args.offset,
    limit: args.limit,
  });
}

async function doSemantic(ctx: ServiceContext, args: RagSearchArgs): Promise<KvPagedResult<string>> {
  return await runSemanticSearch(ctx.supabase, {
    storeId: ctx.storeId,
    tenantId: args.tenantId,
    query: args.query,
    minSimilarity: args.minSimilarity,
    offset: args.offset,
    limit: args.limit,
  });
}

async function doHybrid(ctx: ServiceContext, args: RagSearchArgs): Promise<KvPagedResult<string>> {
  return await runHybridSearch(ctx.supabase, {
    storeId: ctx.storeId,
    tenantId: args.tenantId,
    query: args.query,
    minSimilarity: args.minSimilarity,
    offset: args.offset,
    limit: args.limit,
  });
}

async function doRegex(ctx: ServiceContext, args: RagRegexArgs): Promise<KvPagedResult<string>> {
  return await runRegexSearch(ctx.supabase, {
    storeId: ctx.storeId,
    tenantId: args.tenantId,
    pattern: args.pattern,
    offset: args.offset,
    limit: args.limit,
  });
}

export function makeRagStoreService(supabase: SupabaseClient, storeId: string): RagStoreServices {
  const ctx: ServiceContext = { supabase, storeId };
  return {
    storeId,
    // The 'bm25' agent-tool mode maps to the existing `runSimpleSearch` core
    // (Postgres FTS via rag_text_search).
    searchBm25: async (tenantId, query, offset, limit) =>
      await doBm25(ctx, { tenantId, query, offset, limit }),
    searchSemantic: async (args) => await doSemantic(ctx, args),
    searchHybrid: async (args) => await doHybrid(ctx, args),
    searchRegex: async (args) => await doRegex(ctx, args),
  };
}
