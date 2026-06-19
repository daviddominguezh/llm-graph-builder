import type { BuiltinProvider, ProviderCtx, ToolDescriptor } from '../provider.js';
import { buildRagTools } from './buildTools.js';
import { RAG_DESCRIPTORS, RAG_SEARCH_TOOL_NAME } from './descriptors.js';

async function describeRagTools(_ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  return await Promise.resolve(RAG_DESCRIPTORS);
}

const TOOL_NAMES = [RAG_SEARCH_TOOL_NAME] as const;

export const ragProvider: BuiltinProvider<'rag', typeof TOOL_NAMES> = {
  type: 'builtin',
  id: 'rag',
  displayName: 'OpenFlow/RAG',
  description: 'Search a bound RAG (knowledge base) store using BM25, semantic, hybrid, or regex.',
  toolNames: TOOL_NAMES,
  describeTools: describeRagTools,
  buildTools: buildRagTools,
};
