import type { ProviderCtx } from '../providers/provider.js';
import type { Registry, RegistryBuildResult } from '../providers/registry.js';
import type { SelectedTool } from '../types/selectedTool.js';

const EMPTY_RESULT: RegistryBuildResult = { tools: {}, staleRefs: [], failedProviders: [] };
const NO_TOOLS = 0;

function logStaleRefs(ctx: ProviderCtx, staleRefs: RegistryBuildResult['staleRefs']): void {
  for (const stale of staleRefs) {
    ctx.logger.warn(`agent_tools.stale_drop: ${stale.providerType}:${stale.providerId}:${stale.toolName}`);
  }
}

function logFailedProviders(ctx: ProviderCtx, failed: RegistryBuildResult['failedProviders']): void {
  for (const f of failed) {
    ctx.logger.warn(`provider.build_tools.failure: ${f.providerType}:${f.providerId} ${f.reason}`);
  }
}

export async function buildAgentToolsAtStart(
  registry: Registry,
  ctx: ProviderCtx,
  selectedTools: SelectedTool[]
): Promise<RegistryBuildResult> {
  if (selectedTools.length === NO_TOOLS) return EMPTY_RESULT;
  const result = await registry.buildSelected({ refs: selectedTools, ctx });
  logStaleRefs(ctx, result.staleRefs);
  logFailedProviders(ctx, result.failedProviders);
  return result;
}
