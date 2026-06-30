// Re-export shim (RU1 transition). The RagStoreServices implementation now lives
// in @daviddh/shared-store-services so Node, Worker, and Deno share one copy.
// Resolved via a relative path to the built dist (the edge import map does not
// alias the workspace package), mirroring how this dir imports
// @daviddh/llm-graph-runner. Old file deletion happens in RU6.
//
// makeRagStoreService now requires a 3rd arg: the internal API client (embed +
// rerank), since RAG retrieval reranks every pool and embeds semantic/hybrid
// queries via the Node-only backend hops. We build that client here from the
// edge's existing env (`BACKEND_URL` + `EDGE_FUNCTION_MASTER_KEY`, the same
// source `internalApiClient.ts` reads) and bind it, so call sites keep the
// unchanged `makeRagStoreService(supabase, storeId)` signature.
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  makeInternalApiClient,
  makeRagStoreService as makeShared,
} from '../../../packages/shared-store-services/dist/index.js';

function internalClient(): ReturnType<typeof makeInternalApiClient> {
  return makeInternalApiClient({
    baseUrl: Deno.env.get('BACKEND_URL') ?? '',
    masterKey: Deno.env.get('EDGE_FUNCTION_MASTER_KEY') ?? '',
  });
}

export function makeRagStoreService(
  supabase: SupabaseClient,
  storeId: string
): ReturnType<typeof makeShared> {
  return makeShared(supabase, storeId, internalClient());
}
