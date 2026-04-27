import type { McpServerConfig } from '@daviddh/graph-types';

import type { OAuthTokenBundle, ProviderCtx } from '../providers/provider.js';
import type { Context } from '../types/tools.js';
import type { Logger } from '../utils/logger.js';
import { logger as noopProxyLogger } from '../utils/logger.js';

const EMPTY_OAUTH: ReadonlyMap<string, OAuthTokenBundle> = Object.freeze(new Map<string, OAuthTokenBundle>());
const EMPTY_MCP: ReadonlyMap<string, McpServerConfig> = Object.freeze(new Map<string, McpServerConfig>());

function noServices(): undefined {
  return undefined;
}

function resolveLogger(context: Context): Logger {
  return context.logger ?? noopProxyLogger;
}

function resolveServices(context: Context): (providerId: string) => unknown {
  return context.services ?? noServices;
}

export function providerCtxFromContext(context: Context): ProviderCtx {
  return {
    orgId: context.orgId ?? '',
    agentId: context.agentId ?? '',
    isChildAgent: context.isChildAgent ?? false,
    logger: resolveLogger(context),
    conversationId: context.conversationId,
    contextData: context.contextData,
    oauthTokens: context.oauthTokens ?? EMPTY_OAUTH,
    mcpServers: context.mcpServers ?? EMPTY_MCP,
    services: resolveServices(context),
  };
}
