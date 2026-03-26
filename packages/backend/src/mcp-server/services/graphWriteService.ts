import type { Edge, Node, Operation } from '@daviddh/graph-types';

import { assembleGraph } from '../../db/queries/graphQueries.js';
import { executeOperationsBatch } from '../../db/queries/operationExecutor.js';
import type { ServiceContext } from '../types.js';
import {
  getAffectedEdges,
  loadGraph,
  mergeNodeFields,
  requireEdgeAfterInsert,
  requireNode,
  requireNodeAfterInsert,
} from './graphWriteHelpers.js';
import type {
  AddEdgeInput,
  AddNodeInput,
  BatchMutateResult,
  DeleteNodeResult,
  UpdateEdgeInput,
  UpdateNodeFields,
} from './graphWriteTypes.js';

export type {
  AddEdgeInput,
  AddNodeInput,
  BatchMutateResult,
  DeleteNodeResult,
  UpdateEdgeInput,
  UpdateNodeFields,
} from './graphWriteTypes.js';

/* ------------------------------------------------------------------ */
/*  addNode                                                            */
/* ------------------------------------------------------------------ */

export async function addNode(ctx: ServiceContext, agentId: string, node: AddNodeInput): Promise<Node> {
  const op: Operation = {
    type: 'insertNode',
    data: {
      nodeId: node.id,
      text: node.text,
      kind: node.kind,
      description: node.description,
      agent: node.agent,
      nextNodeIsUser: node.nextNodeIsUser,
      fallbackNodeId: node.fallbackNodeId,
      global: node.global,
      outputSchemaId: node.outputSchemaId,
      outputPrompt: node.outputPrompt,
    },
  };
  await executeOperationsBatch(ctx.supabase, agentId, [op]);
  const graph = await loadGraph(ctx.supabase, agentId);
  return requireNodeAfterInsert(graph, node.id);
}

/* ------------------------------------------------------------------ */
/*  updateNode                                                         */
/* ------------------------------------------------------------------ */

export async function updateNode(
  ctx: ServiceContext,
  agentId: string,
  nodeId: string,
  fields: UpdateNodeFields
): Promise<Node> {
  const graph = await loadGraph(ctx.supabase, agentId);
  const existing = requireNode(graph, nodeId);
  const merged = mergeNodeFields(nodeId, existing, fields);

  const op: Operation = { type: 'updateNode', data: merged };
  await executeOperationsBatch(ctx.supabase, agentId, [op]);
  const updated = await assembleGraph(ctx.supabase, agentId);
  return requireNodeAfterInsert(updated ?? graph, nodeId);
}

/* ------------------------------------------------------------------ */
/*  deleteNode                                                         */
/* ------------------------------------------------------------------ */

export async function deleteNode(
  ctx: ServiceContext,
  agentId: string,
  nodeId: string
): Promise<DeleteNodeResult> {
  const graph = await loadGraph(ctx.supabase, agentId);
  const deletedNode = requireNode(graph, nodeId);
  const affectedEdges = getAffectedEdges(graph, nodeId);

  const op: Operation = { type: 'deleteNode', nodeId };
  await executeOperationsBatch(ctx.supabase, agentId, [op]);

  return { deletedNode, affectedEdges };
}

/* ------------------------------------------------------------------ */
/*  addEdge                                                            */
/* ------------------------------------------------------------------ */

export async function addEdge(ctx: ServiceContext, agentId: string, edge: AddEdgeInput): Promise<Edge> {
  const op: Operation = {
    type: 'insertEdge',
    data: {
      from: edge.from,
      to: edge.to,
      preconditions: edge.preconditions,
      contextPreconditions: edge.contextPreconditions,
    },
  };
  await executeOperationsBatch(ctx.supabase, agentId, [op]);
  const graph = await loadGraph(ctx.supabase, agentId);
  return requireEdgeAfterInsert(graph, edge.from, edge.to);
}

/* ------------------------------------------------------------------ */
/*  updateEdge                                                         */
/* ------------------------------------------------------------------ */

export async function updateEdge(
  ctx: ServiceContext,
  agentId: string,
  input: UpdateEdgeInput
): Promise<void> {
  const op: Operation = {
    type: 'updateEdge',
    data: { from: input.from, to: input.to, ...input.fields },
  };
  await executeOperationsBatch(ctx.supabase, agentId, [op]);
}

/* ------------------------------------------------------------------ */
/*  deleteEdge                                                         */
/* ------------------------------------------------------------------ */

export async function deleteEdge(
  ctx: ServiceContext,
  agentId: string,
  from: string,
  to: string
): Promise<void> {
  const op: Operation = { type: 'deleteEdge', from, to };
  await executeOperationsBatch(ctx.supabase, agentId, [op]);
}

/* ------------------------------------------------------------------ */
/*  setStartNode                                                       */
/* ------------------------------------------------------------------ */

export async function setStartNode(ctx: ServiceContext, agentId: string, nodeId: string): Promise<void> {
  const op: Operation = { type: 'updateStartNode', startNode: nodeId };
  await executeOperationsBatch(ctx.supabase, agentId, [op]);
}

/* ------------------------------------------------------------------ */
/*  batchMutate                                                        */
/* ------------------------------------------------------------------ */

const VALIDATE_AFTER_DEFAULT = true;

export async function batchMutate(
  ctx: ServiceContext,
  agentId: string,
  operations: Operation[],
  validateAfter = VALIDATE_AFTER_DEFAULT
): Promise<BatchMutateResult> {
  await executeOperationsBatch(ctx.supabase, agentId, operations);

  if (validateAfter) {
    await assembleGraph(ctx.supabase, agentId);
  }

  return { applied: operations.length };
}
