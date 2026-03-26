import type { Edge, Graph, Node } from '@daviddh/graph-types';

import { getAgentBySlug } from '../../db/queries/agentQueries.js';
import type { AgentRow } from '../../db/queries/agentQueries.js';
import { assembleGraph } from '../../db/queries/graphQueries.js';
import type { VersionSummary } from '../../db/queries/versionQueries.js';
import type { ServiceContext } from '../types.js';
import { requireGraph } from './graphReadHelpers.js';
import { getGraphSummary } from './graphReadService.js';
import { listMcpServers } from './mcpManagementService.js';
import type { McpServerSummary } from './mcpManagementService.js';
import { listOutputSchemas } from './outputSchemaService.js';
import type { OutputSchemaWithUsage } from './outputSchemaService.js';
import { listVersions } from './publishService.js';
import { getDeadEnds, getOrphans, validateGraph } from './validationService.js';
import type { Violation } from './validationService.js';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type HealthStatus = 'healthy' | 'warnings' | 'errors';

export interface ConfigIssue {
  field: string;
  message: string;
}

export interface AgentHealth {
  status: HealthStatus;
  violations: Violation[];
  orphanNodes: string[];
  deadEndNodes: string[];
  configIssues: ConfigIssue[];
}

export interface DomainInfo {
  domainKey: string;
  description: string | undefined;
  entryPoints: string[];
  exitPoints: string[];
  nodeCount: number;
}

export interface AgentFlowExplanation {
  summary: string;
  domains: DomainInfo[];
  globalBehaviors: string[];
}

export interface AgentOverview {
  agent: AgentRow;
  graphSummary: Awaited<ReturnType<typeof getGraphSummary>>;
  health: AgentHealth;
  mcpServers: McpServerSummary[];
  outputSchemas: OutputSchemaWithUsage[];
  versions: VersionSummary[];
}

/* ------------------------------------------------------------------ */
/*  Health helpers                                                      */
/* ------------------------------------------------------------------ */

const EMPTY = 0;

function hasErrors(violations: Violation[]): boolean {
  return violations.filter((v) => v.severity === 'error').length > EMPTY;
}

function hasWarnings(violations: Violation[], orphans: string[], deadEnds: string[]): boolean {
  return violations.length > EMPTY || orphans.length > EMPTY || deadEnds.length > EMPTY;
}

function resolveHealthStatus(violations: Violation[], orphans: string[], deadEnds: string[]): HealthStatus {
  if (hasErrors(violations)) return 'errors';
  if (hasWarnings(violations, orphans, deadEnds)) return 'warnings';
  return 'healthy';
}

function buildConfigIssues(agent: AgentRow): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (agent.staging_api_key_id === null) {
    issues.push({ field: 'staging_api_key_id', message: 'Staging API key not configured' });
  }
  if (agent.production_api_key_id === null) {
    issues.push({ field: 'production_api_key_id', message: 'Production API key not configured' });
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/*  getAgentHealth                                                      */
/* ------------------------------------------------------------------ */

export async function getAgentHealth(ctx: ServiceContext, agentId: string): Promise<AgentHealth> {
  const agentResult = await getAgentBySlug(ctx.supabase, agentId);
  const [violations, orphanNodes, deadEndNodes] = await Promise.all([
    validateGraph(ctx, agentId),
    getOrphans(ctx, agentId),
    getDeadEnds(ctx, agentId),
  ]);

  const configIssues = agentResult.result === null ? [] : buildConfigIssues(agentResult.result);
  const status = resolveHealthStatus(violations, orphanNodes, deadEndNodes);
  return { status, violations, orphanNodes, deadEndNodes, configIssues };
}

/* ------------------------------------------------------------------ */
/*  getAgentOverview                                                    */
/* ------------------------------------------------------------------ */

export async function getAgentOverview(
  ctx: ServiceContext,
  agentId: string,
  agentSlug: string
): Promise<AgentOverview> {
  const agentResult = await getAgentBySlug(ctx.supabase, agentSlug);
  if (agentResult.error !== null || agentResult.result === null) {
    throw new Error(agentResult.error ?? `Agent not found: ${agentSlug}`);
  }

  const [graphSummary, health, mcpServers, outputSchemas, versions] = await Promise.all([
    getGraphSummary(ctx, agentId),
    getAgentHealth(ctx, agentId),
    listMcpServers(ctx, agentId),
    listOutputSchemas(ctx, agentId),
    listVersions(ctx, agentId),
  ]);

  return { agent: agentResult.result, graphSummary, health, mcpServers, outputSchemas, versions };
}

/* ------------------------------------------------------------------ */
/*  Domain analysis helpers                                             */
/* ------------------------------------------------------------------ */

function getNodeDomain(node: Node): string {
  return node.agent ?? '__global__';
}

function isExternalEdge(edge: Edge, domainNodes: Set<string>): boolean {
  return !domainNodes.has(edge.from) || !domainNodes.has(edge.to);
}

function buildDomainNodeSet(nodes: Node[], domainKey: string): Set<string> {
  return new Set(nodes.filter((n) => getNodeDomain(n) === domainKey).map((n) => n.id));
}

function buildEntryPoints(domainNodes: Set<string>, edges: Edge[]): string[] {
  return edges
    .filter((e) => !domainNodes.has(e.from) && domainNodes.has(e.to))
    .map((e) => e.to)
    .filter((id, i, arr) => arr.indexOf(id) === i);
}

function buildExitPoints(domainNodes: Set<string>, edges: Edge[]): string[] {
  return edges
    .filter((e) => domainNodes.has(e.from) && !domainNodes.has(e.to))
    .map((e) => e.from)
    .filter((id, i, arr) => arr.indexOf(id) === i);
}

function buildDomainInfo(
  domainKey: string,
  description: string | undefined,
  nodes: Node[],
  edges: Edge[]
): DomainInfo {
  const domainNodes = buildDomainNodeSet(nodes, domainKey);
  const domainEdgesExist = edges.some((e) => isExternalEdge(e, domainNodes));
  const entryPoints = domainEdgesExist ? buildEntryPoints(domainNodes, edges) : [];
  const exitPoints = domainEdgesExist ? buildExitPoints(domainNodes, edges) : [];
  return { domainKey, description, entryPoints, exitPoints, nodeCount: domainNodes.size };
}

function buildGlobalBehaviors(graph: Graph): string[] {
  return graph.nodes.filter((n) => n.global).map((n) => n.id);
}

/* ------------------------------------------------------------------ */
/*  explainAgentFlow                                                    */
/* ------------------------------------------------------------------ */

export async function explainAgentFlow(ctx: ServiceContext, agentId: string): Promise<AgentFlowExplanation> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);

  const domains = graph.agents.map((a) => buildDomainInfo(a.id, a.description, graph.nodes, graph.edges));

  const summary = [
    `Agent has ${String(graph.nodes.length)} nodes, ${String(graph.edges.length)} edges,`,
    `${String(graph.agents.length)} domains. Start node: ${graph.startNode}.`,
  ].join(' ');

  return { summary, domains, globalBehaviors: buildGlobalBehaviors(graph) };
}
