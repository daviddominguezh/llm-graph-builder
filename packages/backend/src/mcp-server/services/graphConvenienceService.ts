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
/*  cloneNode input                                                     */
/* ------------------------------------------------------------------ */

interface CloneNodeInput {
  agentId: string;
  nodeId: string;
  newId: string;
  cloneEdges?: boolean;
}

/* ------------------------------------------------------------------ */
/*  cloneNode                                                           */
/* ------------------------------------------------------------------ */

export async function cloneNode(ctx: ServiceContext, input: CloneNodeInput): Promise<void> {
  const raw = await assembleGraph(ctx.supabase, input.agentId);
  const graph = requireGraph(raw, input.agentId);

  const source = graph.nodes.find((n) => n.id === input.nodeId);
  if (source === undefined) throw new Error(`Node not found: ${input.nodeId}`);

  const ops = [
    ...buildCloneNodeOps(source, input.newId),
    ...(input.cloneEdges === true ? buildCloneEdgeOps(input.nodeId, input.newId, graph.edges) : []),
  ];

  await executeOperationsBatch(ctx.supabase, input.agentId, ops);
}

/* ------------------------------------------------------------------ */
/*  insertNodeBetween input                                             */
/* ------------------------------------------------------------------ */

interface InsertBetweenInput {
  agentId: string;
  from: string;
  to: string;
  newNode: NewNodeInput;
}

/* ------------------------------------------------------------------ */
/*  insertNodeBetween                                                   */
/* ------------------------------------------------------------------ */

export async function insertNodeBetween(ctx: ServiceContext, input: InsertBetweenInput): Promise<void> {
  const raw = await assembleGraph(ctx.supabase, input.agentId);
  const graph = requireGraph(raw, input.agentId);

  const edge = graph.edges.find((e) => e.from === input.from && e.to === input.to);
  if (edge === undefined) throw new Error(`Edge not found: ${input.from} -> ${input.to}`);

  const ops = buildInsertBetweenOps(input.from, input.to, input.newNode, edge.preconditions);
  await executeOperationsBatch(ctx.supabase, input.agentId, ops);
}

/* ------------------------------------------------------------------ */
/*  swapEdgeTarget input                                                */
/* ------------------------------------------------------------------ */

interface SwapEdgeInput {
  agentId: string;
  from: string;
  oldTo: string;
  newTo: string;
}

/* ------------------------------------------------------------------ */
/*  swapEdgeTarget                                                      */
/* ------------------------------------------------------------------ */

export async function swapEdgeTarget(ctx: ServiceContext, input: SwapEdgeInput): Promise<void> {
  const raw = await assembleGraph(ctx.supabase, input.agentId);
  const graph = requireGraph(raw, input.agentId);

  const edge = graph.edges.find((e) => e.from === input.from && e.to === input.oldTo);
  if (edge === undefined) throw new Error(`Edge not found: ${input.from} -> ${input.oldTo}`);

  const ops = buildSwapEdgeOps(input.from, input.oldTo, input.newTo, edge);
  await executeOperationsBatch(ctx.supabase, input.agentId, ops);
}

/* ------------------------------------------------------------------ */
/*  listContextFlags                                                    */
/* ------------------------------------------------------------------ */

export async function listContextFlags(ctx: ServiceContext, agentId: string): Promise<ContextFlagUsage[]> {
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
