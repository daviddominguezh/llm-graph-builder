import type { Provider, ProviderCtx, ToolDescriptor } from '../provider.js';
import { buildRagTools } from './buildTools.js';
import { RAG_DESCRIPTORS } from './descriptors.js';

async function describeRagTools(_ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  return await Promise.resolve(RAG_DESCRIPTORS);
}

export const ragProvider: Provider = {
  type: 'builtin',
  id: 'rag',
  displayName: 'OpenFlow/RAG',
  description: 'Search a bound RAG (knowledge base) store using BM25, semantic, hybrid, or regex.',
  describeTools: describeRagTools,
  buildTools: buildRagTools,
};
