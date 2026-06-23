import type { z } from 'zod';

import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool } from '../types.js';
import { CRAWL_TOOL_DESC, EXTRACT_TOOL_DESC, MAP_TOOL_DESC, SEARCH_TOOL_DESC } from './descriptions.js';
import {
  WEB_CRAWL_TOOL_NAME,
  WEB_EXTRACT_TOOL_NAME,
  WEB_MAP_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
} from './descriptors.js';
import { webCrawlInput, webExtractInput, webMapInput, webSearchInput } from './schemas.js';
import { type WebSearchService, isWebProviderServices } from './types.js';

type WebToolName =
  | typeof WEB_SEARCH_TOOL_NAME
  | typeof WEB_EXTRACT_TOOL_NAME
  | typeof WEB_CRAWL_TOOL_NAME
  | typeof WEB_MAP_TOOL_NAME;

interface WebToolCtx {
  service: WebSearchService;
  logger: ProviderCtx['logger'];
}

function logUsage(ctx: WebToolCtx, tool: string, result: unknown): void {
  if (typeof result === 'object' && result !== null && 'usage' in result) {
    ctx.logger.info(`[web] ${tool} usage`, (result as { usage: unknown }).usage);
  }
}

interface ToolSpec<S extends z.ZodType> {
  ctx: WebToolCtx;
  description: string;
  schema: S;
  toolKey: string;
  call: (input: z.infer<S>) => Promise<unknown>;
}

function makeTool<S extends z.ZodType>(spec: ToolSpec<S>): OpenFlowTool {
  return {
    description: spec.description,
    inputSchema: spec.schema,
    execute: async (args: unknown) => {
      const input = spec.schema.parse(args);
      const result = await spec.call(input);
      logUsage(spec.ctx, spec.toolKey, result);
      return result;
    },
  };
}

function buildAll(ctx: WebToolCtx): Record<WebToolName, OpenFlowTool> {
  return {
    [WEB_SEARCH_TOOL_NAME]: makeTool({
      ctx,
      description: SEARCH_TOOL_DESC,
      schema: webSearchInput,
      toolKey: 'search',
      call: async (i) => await ctx.service.search(i),
    }),
    [WEB_EXTRACT_TOOL_NAME]: makeTool({
      ctx,
      description: EXTRACT_TOOL_DESC,
      schema: webExtractInput,
      toolKey: 'extract',
      call: async (i) => await ctx.service.extract(i),
    }),
    [WEB_CRAWL_TOOL_NAME]: makeTool({
      ctx,
      description: CRAWL_TOOL_DESC,
      schema: webCrawlInput,
      toolKey: 'crawl',
      call: async (i) => await ctx.service.crawl(i),
    }),
    [WEB_MAP_TOOL_NAME]: makeTool({
      ctx,
      description: MAP_TOOL_DESC,
      schema: webMapInput,
      toolKey: 'map',
      call: async (i) => await ctx.service.map(i),
    }),
  };
}

const WEB_TOOL_NAMES: readonly string[] = [
  WEB_SEARCH_TOOL_NAME,
  WEB_EXTRACT_TOOL_NAME,
  WEB_CRAWL_TOOL_NAME,
  WEB_MAP_TOOL_NAME,
];

function isWebToolName(s: string): s is WebToolName {
  return WEB_TOOL_NAMES.includes(s);
}

function pickTools(
  all: Record<WebToolName, OpenFlowTool>,
  names: string[]
): Partial<Record<WebToolName, OpenFlowTool>> {
  const out: Partial<Record<WebToolName, OpenFlowTool>> = {};
  for (const name of names) {
    if (!isWebToolName(name)) continue;
    const { [name]: tool } = all;
    out[name] = tool;
  }
  return out;
}

function narrowService(ctx: ProviderCtx): WebSearchService | undefined {
  const raw = ctx.services('web');
  return isWebProviderServices(raw) ? raw.service : undefined;
}

export async function buildWebTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Partial<Record<WebToolName, OpenFlowTool>>> {
  const service = narrowService(args.ctx);
  if (service === undefined) return await Promise.resolve({});
  const toolCtx: WebToolCtx = { service, logger: args.ctx.logger };
  return await Promise.resolve(pickTools(buildAll(toolCtx), args.toolNames));
}
