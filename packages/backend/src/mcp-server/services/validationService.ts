import { assembleGraph } from '../../db/queries/graphQueries.js';
import type { ServiceContext } from '../types.js';
import { requireGraph } from './graphReadHelpers.js';
import { bfsReachability, findShortestPath, getDeadEndNodes, getOrphanNodeIds } from './graphTraversal.js';
import type { PathResult, ReachabilityResult } from './graphTraversal.js';
import {
  checkBrokenJumps,
  checkDanglingFallbacks,
  checkDanglingSchemas,
  checkDeadEnds,
  checkDuplicateEdges,
  checkGlobalNodeTools,
  checkMissingPreconditions,
  checkOrphanNodes,
  checkUnknownAgents,
} from './validationCheckers.js';
import type { Violation } from './validationCheckers.js';

export type { Violation } from './validationCheckers.js';
export type { ReachabilityResult, PathResult } from './graphTraversal.js';

/* ------------------------------------------------------------------ */
/*  validateGraph                                                      */
/* ------------------------------------------------------------------ */

export async function validateGraph(ctx: ServiceContext, agentId: string): Promise<Violation[]> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);

  return [
    ...checkOrphanNodes(graph),
    ...checkDeadEnds(graph),
    ...checkMissingPreconditions(graph),
    ...checkUnknownAgents(graph),
    ...checkDuplicateEdges(graph),
    ...checkBrokenJumps(graph),
    ...checkDanglingSchemas(graph),
    ...checkDanglingFallbacks(graph),
    ...checkGlobalNodeTools(graph),
  ];
}

/* ------------------------------------------------------------------ */
/*  getReachability                                                    */
/* ------------------------------------------------------------------ */

export async function getReachability(
  ctx: ServiceContext,
  agentId: string,
  fromNode: string,
  maxDepth?: number
): Promise<ReachabilityResult> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);
  return bfsReachability(graph, fromNode, maxDepth);
}

/* ------------------------------------------------------------------ */
/*  findPath                                                           */
/* ------------------------------------------------------------------ */

export async function findPath(
  ctx: ServiceContext,
  agentId: string,
  from: string,
  to: string
): Promise<PathResult> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);
  return findShortestPath(graph, from, to);
}

/* ------------------------------------------------------------------ */
/*  getDeadEnds                                                        */
/* ------------------------------------------------------------------ */

export async function getDeadEnds(ctx: ServiceContext, agentId: string): Promise<string[]> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);
  return getDeadEndNodes(graph);
}

/* ------------------------------------------------------------------ */
/*  getOrphans                                                         */
/* ------------------------------------------------------------------ */

export async function getOrphans(ctx: ServiceContext, agentId: string): Promise<string[]> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);
  return getOrphanNodeIds(graph);
}
