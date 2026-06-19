import type { BuiltinProvider, ProviderCtx, ToolDescriptor } from '../provider.js';
import { buildKvTools } from './buildTools.js';
import {
  KV_DESCRIPTORS,
  KV_GET_VALUES_TOOL_NAME,
  KV_LIST_KEYS_TOOL_NAME,
  KV_SEARCH_TOOL_NAME,
  KV_UPDATE_VALUE_TOOL_NAME,
} from './descriptors.js';

async function describeKvTools(_ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  return await Promise.resolve(KV_DESCRIPTORS);
}

const TOOL_NAMES = [
  KV_LIST_KEYS_TOOL_NAME,
  KV_GET_VALUES_TOOL_NAME,
  KV_SEARCH_TOOL_NAME,
  KV_UPDATE_VALUE_TOOL_NAME,
] as const;

export const kvStoreProvider: BuiltinProvider<'kv_store', typeof TOOL_NAMES> = {
  type: 'builtin',
  id: 'kv_store',
  displayName: 'OpenFlow/KV Store',
  description: 'Read, search, and update entries in a bound key-value store, scoped per tenant.',
  toolNames: TOOL_NAMES,
  describeTools: describeKvTools,
  buildTools: buildKvTools,
};
