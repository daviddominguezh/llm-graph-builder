import type { Agent, Graph, Node } from '@daviddh/graph-types';

import { assembleGraph } from '../../db/queries/graphQueries.js';
import { executeOperationsBatch } from '../../db/queries/operationExecutor.js';
import type { ServiceContext } from '../types.js';

export interface AgentDomainSummary {
  key: string;
  description: string | undefined;
  nodeCount: number;
}

const NO_NODES = 0;

function requireGraph(graph: Graph | null, agentId: string): Graph {
  if (graph === null) throw new Error(`Graph not found for agent: ${agentId}`);
  return graph;
}

function countNodesForDomain(nodes: Node[], key: string): number {
  return nodes.filter((n) => n.agent === key).length;
}

function toSummary(agent: Agent, nodes: Node[]): AgentDomainSummary {
  return {
    key: agent.id,
    description: agent.description,
    nodeCount: countNodesForDomain(nodes, agent.id),
  };
}

export async function listAgentDomains(ctx: ServiceContext, agentId: string): Promise<AgentDomainSummary[]> {
  const graph = requireGraph(await assembleGraph(ctx.supabase, agentId), agentId);
  return graph.agents.map((agent) => toSummary(agent, graph.nodes));
}

export async function addAgentDomain(
  ctx: ServiceContext,
  agentId: string,
  key: string,
  description?: string
): Promise<void> {
  await executeOperationsBatch(ctx.supabase, agentId, [
    { type: 'insertAgent', data: { agentKey: key, description } },
  ]);
}

export async function updateAgentDomain(
  ctx: ServiceContext,
  agentId: string,
  key: string,
  description: string
): Promise<void> {
  await executeOperationsBatch(ctx.supabase, agentId, [
    { type: 'updateAgent', data: { agentKey: key, description } },
  ]);
}

function buildReferencingNodeIds(nodes: Node[], key: string): string[] {
  return nodes.filter((n) => n.agent === key).map((n) => n.id);
}

function assertNoDomainReferences(referencingIds: string[], key: string): void {
  if (referencingIds.length > NO_NODES) {
    throw new Error(`Cannot delete domain "${key}": nodes still reference it: ${referencingIds.join(', ')}`);
  }
}

export async function deleteAgentDomain(ctx: ServiceContext, agentId: string, key: string): Promise<void> {
  const graph = requireGraph(await assembleGraph(ctx.supabase, agentId), agentId);
  const referencingIds = buildReferencingNodeIds(graph.nodes, key);

  assertNoDomainReferences(referencingIds, key);

  await executeOperationsBatch(ctx.supabase, agentId, [{ type: 'deleteAgent', agentKey: key }]);
}
