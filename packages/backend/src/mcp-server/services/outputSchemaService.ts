import type { Graph, OutputSchemaEntity, OutputSchemaField } from '@daviddh/graph-types';
import { randomUUID } from 'node:crypto';

import { assembleGraph } from '../../db/queries/graphQueries.js';
import { executeOperationsBatch } from '../../db/queries/operationExecutor.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OutputSchemaWithUsage extends OutputSchemaEntity {
  usedByNodes: string[];
}

export interface DeleteOutputSchemaResult {
  success: boolean;
  warning?: string;
}

export interface UpdateOutputSchemaFields {
  name?: string;
  fields?: OutputSchemaField[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const NO_REFERENCES = 0;

function requireGraph(graph: Graph | null, agentId: string): Graph {
  if (graph === null) throw new Error(`Graph not found for agent: ${agentId}`);
  return graph;
}

function requireSchema(graph: Graph, schemaId: string): OutputSchemaEntity {
  const schema = (graph.outputSchemas ?? []).find((s) => s.id === schemaId);
  if (schema === undefined) throw new Error(`Output schema not found: ${schemaId}`);
  return schema;
}

function getUsedByNodes(graph: Graph, schemaId: string): string[] {
  return graph.nodes.filter((n) => n.outputSchemaId === schemaId).map((n) => n.id);
}

function toWithUsage(graph: Graph, schema: OutputSchemaEntity): OutputSchemaWithUsage {
  return { ...schema, usedByNodes: getUsedByNodes(graph, schema.id) };
}

/* ------------------------------------------------------------------ */
/*  Service functions                                                  */
/* ------------------------------------------------------------------ */

export async function listOutputSchemas(
  ctx: ServiceContext,
  agentId: string
): Promise<OutputSchemaWithUsage[]> {
  const graph = requireGraph(await assembleGraph(ctx.supabase, agentId), agentId);
  return (graph.outputSchemas ?? []).map((s) => toWithUsage(graph, s));
}

export async function getOutputSchema(
  ctx: ServiceContext,
  agentId: string,
  schemaId: string
): Promise<OutputSchemaEntity> {
  const graph = requireGraph(await assembleGraph(ctx.supabase, agentId), agentId);
  return requireSchema(graph, schemaId);
}

export async function addOutputSchema(
  ctx: ServiceContext,
  agentId: string,
  name: string,
  fields: OutputSchemaField[]
): Promise<{ schemaId: string }> {
  const schemaId = randomUUID();
  await executeOperationsBatch(ctx.supabase, agentId, [
    { type: 'insertOutputSchema', data: { schemaId, name, fields } },
  ]);
  return { schemaId };
}

export async function updateOutputSchema(
  ctx: ServiceContext,
  agentId: string,
  schemaId: string,
  updates: UpdateOutputSchemaFields
): Promise<void> {
  const graph = requireGraph(await assembleGraph(ctx.supabase, agentId), agentId);
  const existing = requireSchema(graph, schemaId);
  await executeOperationsBatch(ctx.supabase, agentId, [
    {
      type: 'updateOutputSchema',
      data: {
        schemaId,
        name: updates.name ?? existing.name,
        fields: updates.fields ?? existing.fields,
      },
    },
  ]);
}

export async function deleteOutputSchema(
  ctx: ServiceContext,
  agentId: string,
  schemaId: string
): Promise<DeleteOutputSchemaResult> {
  const graph = requireGraph(await assembleGraph(ctx.supabase, agentId), agentId);
  const usedBy = getUsedByNodes(graph, schemaId);
  await executeOperationsBatch(ctx.supabase, agentId, [{ type: 'deleteOutputSchema', schemaId }]);
  if (usedBy.length === NO_REFERENCES) return { success: true };
  return { success: true, warning: `Schema is referenced by nodes: ${usedBy.join(', ')}` };
}
