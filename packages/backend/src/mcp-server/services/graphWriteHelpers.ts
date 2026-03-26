import type { Edge, Graph, Node } from '@daviddh/graph-types';

import { assembleGraph } from '../../db/queries/graphQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { MergedNodeData, UpdateNodeFields } from './graphWriteTypes.js';

/* ------------------------------------------------------------------ */
/*  Graph loading                                                      */
/* ------------------------------------------------------------------ */

export async function loadGraph(supabase: SupabaseClient, agentId: string): Promise<Graph> {
  const graph = await assembleGraph(supabase, agentId);
  if (graph === null) throw new Error(`Graph not found: ${agentId}`);
  return graph;
}

/* ------------------------------------------------------------------ */
/*  Node lookup helpers                                                */
/* ------------------------------------------------------------------ */

export function requireNode(graph: Graph, nodeId: string): Node {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (node === undefined) throw new Error(`Node not found: ${nodeId}`);
  return node;
}

export function requireNodeAfterInsert(graph: Graph, nodeId: string): Node {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (node === undefined) throw new Error(`Node not found after insert: ${nodeId}`);
  return node;
}

/* ------------------------------------------------------------------ */
/*  mergeNodeFields                                                    */
/* ------------------------------------------------------------------ */

export function mergeNodeFields(nodeId: string, existing: Node, fields: UpdateNodeFields): MergedNodeData {
  return {
    nodeId,
    text: fields.text ?? existing.text,
    kind: fields.kind ?? existing.kind,
    description: fields.description ?? existing.description,
    agent: fields.agent ?? existing.agent,
    nextNodeIsUser: fields.nextNodeIsUser ?? existing.nextNodeIsUser,
    fallbackNodeId: fields.fallbackNodeId ?? existing.fallbackNodeId,
    global: fields.global ?? existing.global,
    outputSchemaId: fields.outputSchemaId ?? existing.outputSchemaId,
    outputPrompt: fields.outputPrompt ?? existing.outputPrompt,
  };
}

/* ------------------------------------------------------------------ */
/*  Edge lookup helpers                                                */
/* ------------------------------------------------------------------ */

export function requireEdgeAfterInsert(graph: Graph, from: string, to: string): Edge {
  const edge = graph.edges.find((e) => e.from === from && e.to === to);
  if (edge === undefined) throw new Error(`Edge not found after insert: ${from} -> ${to}`);
  return edge;
}

export function getAffectedEdges(graph: Graph, nodeId: string): Edge[] {
  return graph.edges.filter((e) => e.from === nodeId || e.to === nodeId);
}
