// Barrel re-export for the Deno-side KV/RAG store services.
//
// The factories that talk to Postgres directly live in
// `kvStoreServices.ts` / `ragStoreServices.ts`. The no-store-bound sentinel
// helpers (used when the agent has no store selected) stay alongside, since
// every method just throws and there's no Postgres work to do.
import type { KvStoreServices, RagStoreServices } from '@daviddh/llm-graph-runner';
import { ToolError } from '@daviddh/llm-graph-runner';

export { makeKvStoreService } from './kvStoreServices.ts';
export { makeRagStoreService } from './ragStoreServices.ts';

const NO_STORE_SENTINEL_ID = '__no_store__';
const NO_STORE_MESSAGE = 'No store is bound to this agent.';

function failNoStore(): never {
  throw new ToolError('no_store_bound', NO_STORE_MESSAGE);
}

export function makeNoStoreBoundKvServices(): KvStoreServices {
  return {
    storeId: NO_STORE_SENTINEL_ID,
    listKeys: () => failNoStore(),
    getValues: () => failNoStore(),
    searchSubstring: () => failNoStore(),
    searchRegex: () => failNoStore(),
    updateValue: () => failNoStore(),
  };
}

export function makeNoStoreBoundRagServices(): RagStoreServices {
  return {
    storeId: NO_STORE_SENTINEL_ID,
    searchBm25: () => failNoStore(),
    searchSemantic: () => failNoStore(),
    searchHybrid: () => failNoStore(),
    searchRegex: () => failNoStore(),
  };
}
