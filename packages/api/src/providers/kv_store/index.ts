import type { Provider, ProviderCtx, ToolDescriptor } from '../provider.js';
import { buildKvTools } from './buildTools.js';
import { KV_DESCRIPTORS } from './descriptors.js';

async function describeKvTools(_ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  return await Promise.resolve(KV_DESCRIPTORS);
}

export const kvStoreProvider: Provider = {
  type: 'builtin',
  id: 'kv_store',
  displayName: 'OpenFlow/KV Store',
  description: 'Read, search, and update entries in a bound key-value store, scoped per tenant.',
  describeTools: describeKvTools,
  buildTools: buildKvTools,
};
