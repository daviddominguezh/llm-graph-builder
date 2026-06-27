// Re-export shim (RU1 transition). The RAG retrieval implementation now lives in
// @daviddh/shared-store-services. The backend wrapper builds the internal-api
// client (embed + rerank) from env and binds it so callers keep the unchanged
// `makeRagStoreService(supabase, storeId)` signature. Old file deletion in RU6.
import type { RagStoreServices } from '@daviddh/llm-graph-runner';
import { makeInternalApiClient, makeRagStoreService as makeShared } from '@daviddh/shared-store-services';
import type { SupabaseClient } from '@supabase/supabase-js';

function internalClient(): ReturnType<typeof makeInternalApiClient> {
  return makeInternalApiClient({
    baseUrl: process.env.BACKEND_INTERNAL_URL ?? 'http://127.0.0.1:4000',
    masterKey: process.env.EDGE_FUNCTION_MASTER_KEY ?? '',
  });
}

export function makeRagStoreService(supabase: SupabaseClient, storeId: string): RagStoreServices {
  return makeShared(supabase, storeId, internalClient());
}
