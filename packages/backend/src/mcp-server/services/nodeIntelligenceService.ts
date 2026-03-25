import type { Edge, Graph, Precondition } from '@daviddh/graph-types';

import { assembleGraph } from '../../db/queries/graphQueries.js';
import type { ServiceContext } from '../types.js';
import type { NodeDetails } from './graphReadHelpers.js';
import { requireGraph } from './graphReadHelpers.js';
import { getNode } from './graphReadService.js';
import { getNodePrompt } from './promptService.js';
import type { NodePromptResult } from './promptService.js';
import { getReachability } from './validationService.js';
import type { ReachabilityResult } from './validationService.js';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface NodeFullContext {
  details: NodeDetails;
  prompt: NodePromptResult;
  reachability: ReachabilityResult;
}

export interface PreconditionExplanation {
  type: string;
  value: string;
  description?: string;
}

export interface EdgeExplanation {
  from: string;
  to: string;
  preconditions: PreconditionExplanation[];
  contextFlags: string[];
  summary: string;
}

/* ------------------------------------------------------------------ */
/*  Edge explanation helpers                                            */
/* ------------------------------------------------------------------ */

function formatPrecondition(p: Precondition): string {
  const base = `${p.type}: "${p.value}"`;
  if (p.description === undefined) return base;
  return `${base} (${p.description})`;
}

function buildPreconditionExplanations(preconditions: Precondition[]): PreconditionExplanation[] {
  return preconditions.map((p) => ({
    type: p.type,
    value: p.value,
    description: p.description,
  }));
}

const EMPTY_COUNT = 0;

function buildEdgeSummary(from: string, to: string, preconditions: Precondition[]): string {
  if (preconditions.length === EMPTY_COUNT) {
    return `Unconditional transition from ${from} to ${to}`;
  }
  const parts = preconditions.map(formatPrecondition);
  return `From ${from} to ${to} when: ${parts.join(' OR ')}`;
}

function findEdge(graph: Graph, from: string, to: string): Edge {
  const edge = graph.edges.find((e) => e.from === from && e.to === to);
  if (edge === undefined) throw new Error(`Edge not found: ${from} -> ${to}`);
  return edge;
}

/* ------------------------------------------------------------------ */
/*  getNodeFullContext                                                   */
/* ------------------------------------------------------------------ */

export async function getNodeFullContext(
  ctx: ServiceContext,
  agentId: string,
  nodeId: string
): Promise<NodeFullContext> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);

  const [details, prompt, reachability] = await Promise.all([
    getNode(ctx, agentId, nodeId),
    getNodePrompt(ctx, agentId, nodeId),
    getReachability(ctx, agentId, graph.startNode),
  ]);

  return { details, prompt, reachability };
}

/* ------------------------------------------------------------------ */
/*  explainEdge                                                         */
/* ------------------------------------------------------------------ */

export async function explainEdge(
  ctx: ServiceContext,
  agentId: string,
  from: string,
  to: string
): Promise<EdgeExplanation> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);

  const edge = findEdge(graph, from, to);
  const preconditions = edge.preconditions ?? [];
  const contextFlags = edge.contextPreconditions?.preconditions ?? [];

  return {
    from: edge.from,
    to: edge.to,
    preconditions: buildPreconditionExplanations(preconditions),
    contextFlags,
    summary: buildEdgeSummary(from, to, preconditions),
  };
}
