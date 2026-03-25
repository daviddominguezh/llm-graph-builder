import { assembleGraph } from '../../db/queries/graphQueries.js';
import { executeOperationsBatch } from '../../db/queries/operationExecutor.js';
import type { ServiceContext } from '../types.js';
import {
  buildCloneEdgeOps,
  buildCloneNodeOps,
  buildInsertBetweenOps,
  buildScaffoldOps,
  buildSwapEdgeOps,
  extractFlagUsages,
  extractMcpToolUsages,
} from './graphConvenienceHelpers.js';
import type {
  ContextFlagUsage,
  McpToolUsage,
  NewNodeInput,
  ScaffoldPattern,
} from './graphConvenienceHelpers.js';
import { requireGraph } from './graphReadHelpers.js';

export type { ContextFlagUsage, McpToolUsage, NewNodeInput, ScaffoldPattern };

/* ------------------------------------------------------------------ */
/*  cloneNode                                                           */
/* ------------------------------------------------------------------ */

export async function cloneNode(
  ctx: ServiceContext,
  agentId: string,
  nodeId: string,
  newId: string,
  cloneEdges = false
): Promise<void> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);

  const source = graph.nodes.find((n) => n.id === nodeId);
  if (source === undefined) throw new Error(`Node not found: ${nodeId}`);

  const ops = [
    ...buildCloneNodeOps(source, newId),
    ...(cloneEdges ? buildCloneEdgeOps(nodeId, newId, graph.edges) : []),
  ];

  await executeOperationsBatch(ctx.supabase, agentId, ops);
}

/* ------------------------------------------------------------------ */
/*  insertNodeBetween                                                   */
/* ------------------------------------------------------------------ */

export async function insertNodeBetween(
  ctx: ServiceContext,
  agentId: string,
  from: string,
  to: string,
  newNode: NewNodeInput
): Promise<void> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);

  const edge = graph.edges.find((e) => e.from === from && e.to === to);
  if (edge === undefined) throw new Error(`Edge not found: ${from} -> ${to}`);

  const ops = buildInsertBetweenOps(from, to, newNode, edge.preconditions);
  await executeOperationsBatch(ctx.supabase, agentId, ops);
}

/* ------------------------------------------------------------------ */
/*  swapEdgeTarget                                                      */
/* ------------------------------------------------------------------ */

export async function swapEdgeTarget(
  ctx: ServiceContext,
  agentId: string,
  from: string,
  oldTo: string,
  newTo: string
): Promise<void> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);

  const edge = graph.edges.find((e) => e.from === from && e.to === oldTo);
  if (edge === undefined) throw new Error(`Edge not found: ${from} -> ${oldTo}`);

  const ops = buildSwapEdgeOps(from, oldTo, newTo, edge);
  await executeOperationsBatch(ctx.supabase, agentId, ops);
}

/* ------------------------------------------------------------------ */
/*  listContextFlags                                                    */
/* ------------------------------------------------------------------ */

export async function listContextFlags(
  ctx: ServiceContext,
  agentId: string
): Promise<ContextFlagUsage[]> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);
  return extractFlagUsages(graph);
}

/* ------------------------------------------------------------------ */
/*  getMcpToolUsage                                                     */
/* ------------------------------------------------------------------ */

export async function getMcpToolUsage(ctx: ServiceContext, agentId: string): Promise<McpToolUsage[]> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);
  return extractMcpToolUsages(graph);
}

/* ------------------------------------------------------------------ */
/*  scaffoldAgentDomain                                                 */
/* ------------------------------------------------------------------ */

export async function scaffoldAgentDomain(
  ctx: ServiceContext,
  agentId: string,
  domainKey: string,
  pattern: ScaffoldPattern = 'linear'
): Promise<void> {
  const ops = buildScaffoldOps(domainKey, pattern);
  await executeOperationsBatch(ctx.supabase, agentId, ops);
}
