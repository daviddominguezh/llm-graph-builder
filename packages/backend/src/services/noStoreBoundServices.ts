import type { KvStoreServices, RagStoreServices } from '@daviddh/llm-graph-runner';
import { ToolError } from '@daviddh/llm-graph-runner';

const NO_STORE_MESSAGE = 'No store is bound to this agent.';

// Sentinel storeId surfaced on no-store-bound services. The value is never used
// for DB lookups (every method throws), but the field is required by the
// `KvStoreServices` / `RagStoreServices` interfaces. Exported so callers and
// tests can compare against the sentinel rather than the bare empty string.
export const NO_STORE_SENTINEL_ID = '__no_store__';

function fail(): never {
  throw new ToolError('no_store_bound', NO_STORE_MESSAGE);
}

export function makeNoStoreBoundKvServices(): KvStoreServices {
  return {
    storeId: NO_STORE_SENTINEL_ID,
    listKeys: () => fail(),
    getValues: () => fail(),
    searchSubstring: () => fail(),
    searchRegex: () => fail(),
    updateValue: () => fail(),
  };
}

export function makeNoStoreBoundRagServices(): RagStoreServices {
  return {
    storeId: NO_STORE_SENTINEL_ID,
    searchBm25: () => fail(),
    searchSemantic: () => fail(),
    searchHybrid: () => fail(),
    searchRegex: () => fail(),
  };
}
