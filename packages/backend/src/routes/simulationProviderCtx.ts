import type { McpServerConfig } from '@daviddh/graph-types';
import {
  type OAuthTokenBundle,
  type ProviderCtx,
  type Registry,
  builtInProviders,
  composeRegistry,
  createTransport,
} from '@daviddh/llm-graph-runner';

import { makeGuardedCreateTransport } from '../lib/guardedCreateTransport.js';
import { consoleLogger } from '../logger.js';

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
  tenantId: string;
  agentId: string;
  isChildAgent?: boolean;
  dispatchDepth?: number;
  conversationId?: string;
  contextData?: Readonly<Record<string, unknown>>;
  oauthTokens?: ReadonlyMap<string, OAuthTokenBundle>;
  mcpServers?: McpServerConfig[];
  services: SimulationServicesResolver;
  simulationState?: Record<string, unknown>;
  writeSimulationState?: (path: string, value: unknown) => void;
}

const NOOP_WRITE: (path: string, value: unknown) => void = () => undefined;

const ROOT_DISPATCH_DEPTH = 0;

export function buildSimulationProviderCtx(args: SimulationCtxArgs): ProviderCtx {
  const mcpServerEntries: Array<[string, McpServerConfig]> = (args.mcpServers ?? []).map((s) => [s.id, s]);
  return {
    environment: 'simulation',
    orgId: args.orgId,
    tenantId: args.tenantId,
    agentId: args.agentId,
    isChildAgent: args.isChildAgent ?? false,
    dispatchDepth: args.dispatchDepth ?? ROOT_DISPATCH_DEPTH,
    logger: consoleLogger,
    conversationId: args.conversationId,
    contextData: args.contextData,
    oauthTokens: args.oauthTokens ?? new Map<string, OAuthTokenBundle>(),
    mcpServers: new Map<string, McpServerConfig>(mcpServerEntries),
    services: args.services,
    simulationState: args.simulationState ?? {},
    writeSimulationState: args.writeSimulationState ?? NOOP_WRITE,
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
    createTransport: makeGuardedCreateTransport(createTransport),
  });
}
