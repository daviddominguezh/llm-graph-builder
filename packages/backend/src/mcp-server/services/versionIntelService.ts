import type { Edge, Graph, Node } from '@daviddh/graph-types';

import { assembleGraph } from '../../db/queries/graphQueries.js';
import { getVersionSnapshot } from '../../db/queries/versionQueries.js';
import type { ServiceContext } from '../types.js';
import { requireGraph } from './graphReadHelpers.js';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type VersionRef = number | 'draft';

export interface NodeDiff {
  added: Node[];
  removed: Node[];
  modified: Array<{ id: string; from: Node; to: Node }>;
}

export interface EdgeDiff {
  added: Edge[];
  removed: Edge[];
}

export interface VersionDiff {
  fromVersion: VersionRef;
  toVersion: VersionRef;
  nodes: NodeDiff;
  edges: EdgeDiff;
  startNodeChanged: boolean;
  fromStartNode: string;
  toStartNode: string;
  agentDomainsAdded: string[];
  agentDomainsRemoved: string[];
  mcpServersAdded: string[];
  mcpServersRemoved: string[];
  outputSchemasAdded: string[];
  outputSchemasRemoved: string[];
  summary: string;
}

/* ------------------------------------------------------------------ */
/*  Graph loading helpers                                               */
/* ------------------------------------------------------------------ */

async function loadGraph(
  ctx: ServiceContext,
  agentId: string,
  version: VersionRef
): Promise<Graph> {
  if (version === 'draft') {
    const raw = await assembleGraph(ctx.supabase, agentId);
    return requireGraph(raw, agentId);
  }
  const snapshot = await getVersionSnapshot(ctx.supabase, agentId, version);
  if (snapshot === null) throw new Error(`Version ${String(version)} not found`);
  return snapshot;
}

/* ------------------------------------------------------------------ */
/*  Diff helpers                                                        */
/* ------------------------------------------------------------------ */

function diffNodes(from: Graph, to: Graph): NodeDiff {
  const fromMap = new Map(from.nodes.map((n) => [n.id, n]));
  const toMap = new Map(to.nodes.map((n) => [n.id, n]));

  const added = to.nodes.filter((n) => !fromMap.has(n.id));
  const removed = from.nodes.filter((n) => !toMap.has(n.id));
  const modified: Array<{ id: string; from: Node; to: Node }> = [];

  for (const [id, fromNode] of fromMap) {
    const toNode = toMap.get(id);
    if (toNode !== undefined && JSON.stringify(fromNode) !== JSON.stringify(toNode)) {
      modified.push({ id, from: fromNode, to: toNode });
    }
  }

  return { added, removed, modified };
}

function edgeKey(e: Edge): string {
  return `${e.from}__${e.to}`;
}

function diffEdges(from: Graph, to: Graph): EdgeDiff {
  const fromKeys = new Set(from.edges.map(edgeKey));
  const toKeys = new Set(to.edges.map(edgeKey));

  const added = to.edges.filter((e) => !fromKeys.has(edgeKey(e)));
  const removed = from.edges.filter((e) => !toKeys.has(edgeKey(e)));

  return { added, removed };
}

function diffStringArrays(from: string[], to: string[]): { added: string[]; removed: string[] } {
  const fromSet = new Set(from);
  const toSet = new Set(to);
  return {
    added: to.filter((v) => !fromSet.has(v)),
    removed: from.filter((v) => !toSet.has(v)),
  };
}

function buildSummary(diff: Omit<VersionDiff, 'summary'>, from: VersionRef, to: VersionRef): string {
  const parts: string[] = [`Diff from v${String(from)} to v${String(to)}:`];
  if (diff.nodes.added.length > 0) parts.push(`+${String(diff.nodes.added.length)} nodes`);
  if (diff.nodes.removed.length > 0) parts.push(`-${String(diff.nodes.removed.length)} nodes`);
  if (diff.nodes.modified.length > 0) parts.push(`~${String(diff.nodes.modified.length)} modified nodes`);
  if (diff.edges.added.length > 0) parts.push(`+${String(diff.edges.added.length)} edges`);
  if (diff.edges.removed.length > 0) parts.push(`-${String(diff.edges.removed.length)} edges`);
  if (diff.startNodeChanged) parts.push(`start node changed`);
  if (parts.length === 1) parts.push('no changes');
  return parts.join(' ');
}

/* ------------------------------------------------------------------ */
/*  diffVersions                                                        */
/* ------------------------------------------------------------------ */

export async function diffVersions(
  ctx: ServiceContext,
  agentId: string,
  fromVersion: VersionRef,
  toVersion: VersionRef
): Promise<VersionDiff> {
  const [fromGraph, toGraph] = await Promise.all([
    loadGraph(ctx, agentId, fromVersion),
    loadGraph(ctx, agentId, toVersion),
  ]);

  const nodes = diffNodes(fromGraph, toGraph);
  const edges = diffEdges(fromGraph, toGraph);

  const fromAgents = fromGraph.agents.map((a) => a.id);
  const toAgents = toGraph.agents.map((a) => a.id);
  const agentDiff = diffStringArrays(fromAgents, toAgents);

  const fromMcp = (fromGraph.mcpServers ?? []).map((s) => s.id);
  const toMcp = (toGraph.mcpServers ?? []).map((s) => s.id);
  const mcpDiff = diffStringArrays(fromMcp, toMcp);

  const fromSchemas = (fromGraph.outputSchemas ?? []).map((s) => s.id);
  const toSchemas = (toGraph.outputSchemas ?? []).map((s) => s.id);
  const schemaDiff = diffStringArrays(fromSchemas, toSchemas);

  const startNodeChanged = fromGraph.startNode !== toGraph.startNode;

  const partial: Omit<VersionDiff, 'summary'> = {
    fromVersion,
    toVersion,
    nodes,
    edges,
    startNodeChanged,
    fromStartNode: fromGraph.startNode,
    toStartNode: toGraph.startNode,
    agentDomainsAdded: agentDiff.added,
    agentDomainsRemoved: agentDiff.removed,
    mcpServersAdded: mcpDiff.added,
    mcpServersRemoved: mcpDiff.removed,
    outputSchemasAdded: schemaDiff.added,
    outputSchemasRemoved: schemaDiff.removed,
  };

  return { ...partial, summary: buildSummary(partial, fromVersion, toVersion) };
}
