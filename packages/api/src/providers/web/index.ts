import type { BuiltinProvider, ProviderCtx, ToolDescriptor } from '../provider.js';
import { buildWebTools } from './buildTools.js';
import {
  WEB_CRAWL_TOOL_NAME,
  WEB_DESCRIPTORS,
  WEB_EXTRACT_TOOL_NAME,
  WEB_MAP_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
} from './descriptors.js';

async function describeWebTools(_ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  return await Promise.resolve(WEB_DESCRIPTORS);
}

const TOOL_NAMES = [
  WEB_SEARCH_TOOL_NAME,
  WEB_EXTRACT_TOOL_NAME,
  WEB_CRAWL_TOOL_NAME,
  WEB_MAP_TOOL_NAME,
] as const;

export const webProvider: BuiltinProvider<'web', typeof TOOL_NAMES> = {
  type: 'builtin',
  id: 'web',
  displayName: 'OpenFlow/Web',
  description: 'Search the web, extract page content, and crawl or map sites.',
  toolNames: TOOL_NAMES,
  describeTools: describeWebTools,
  buildTools: buildWebTools,
};
