import type { McpServerConfig } from '@daviddh/graph-types';
import {
  type OAuthTokenBundle,
  type ProviderCtx,
  type Registry,
  builtInProviders,
  composeRegistry,
} from '@daviddh/llm-graph-runner';

import { consoleLogger } from '../logger.js';
import { createBackendMcpConnector } from '../mcp/connector.js';

/**
 * Resolves a provider-id to its runtime services bundle for simulation.
 * The simulation paths build whichever services they have on hand
 * (FormsServices, LeadScoringServices, CalendarServices, etc.) and pass
 * a closure to the helper below — keeping this file decoupled from any
 * concrete service constructions.
 */
export type SimulationServicesResolver = (providerId: string) => unknown;

export interface SimulationCtxArgs {
  orgId: string;
  agentId: string;
  isChildAgent?: boolean;
  conversationId?: string;
  contextData?: Readonly<Record<string, unknown>>;
  oauthTokens?: ReadonlyMap<string, OAuthTokenBundle>;
  mcpServers?: McpServerConfig[];
  services: SimulationServicesResolver;
}

export function buildSimulationProviderCtx(args: SimulationCtxArgs): ProviderCtx {
  const mcpServerEntries: Array<[string, McpServerConfig]> = (args.mcpServers ?? []).map((s) => [s.id, s]);
  return {
    orgId: args.orgId,
    agentId: args.agentId,
    isChildAgent: args.isChildAgent ?? false,
    logger: consoleLogger,
    conversationId: args.conversationId,
    contextData: args.contextData,
    oauthTokens: args.oauthTokens ?? new Map<string, OAuthTokenBundle>(),
    mcpServers: new Map<string, McpServerConfig>(mcpServerEntries),
    mcpConnector: createBackendMcpConnector(),
    services: args.services,
  };
}

export interface SimulationRegistryArgs {
  mcpServers: McpServerConfig[];
}

export function buildSimulationRegistry(args: SimulationRegistryArgs): Registry {
  return composeRegistry({
    builtIns: builtInProviders,
    orgMcpServers: args.mcpServers,
    logger: consoleLogger,
  });
}
