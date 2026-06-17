import type { KvStoreServices, RagStoreServices } from '@daviddh/llm-graph-runner';
import { ToolError } from '@daviddh/llm-graph-runner';

const NO_STORE_MESSAGE = 'No store is bound to this agent.';

function fail(): never {
  throw new ToolError('no_store_bound', NO_STORE_MESSAGE);
}

export function makeNoStoreBoundKvServices(): KvStoreServices {
  return {
    storeId: '',
    listKeys: () => fail(),
    getValues: () => fail(),
    searchSubstring: () => fail(),
    searchRegex: () => fail(),
    updateValue: () => fail(),
  };
}

export function makeNoStoreBoundRagServices(): RagStoreServices {
  return {
    storeId: '',
    searchBm25: () => fail(),
    searchSemantic: () => fail(),
    searchHybrid: () => fail(),
    searchRegex: () => fail(),
  };
}
