import type {
  Agent,
  ContextPreconditions,
  Edge,
  McpServerConfig,
  McpTransport,
  Node,
  OutputSchemaEntity,
  OutputSchemaField,
  Precondition,
  ToolFieldValue,
} from '@daviddh/graph-types';
import {
  McpTransportSchema,
  OutputSchemaFieldSchema,
  ToolFieldValueSchema,
  VariableValueSchema,
} from '@daviddh/graph-types';
import { z } from 'zod';

import type {
  AgentRow,
  EdgeContextPreconditionRow,
  EdgePreconditionRow,
  EdgeRow,
  McpServerRow,
  NodeRow,
  OutputSchemaRow,
} from './graphRowTypes.js';

const EMPTY_LENGTH = 0;
const FIRST_INDEX = 0;

const ToolFieldsSchema = z.record(z.string(), ToolFieldValueSchema);

function parseToolFields(raw: Record<string, unknown> | null): Record<string, ToolFieldValue> | undefined {
  if (raw === null) return undefined;
  const result = ToolFieldsSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}

function parseOutputSchemaFields(raw: Array<Record<string, unknown>>): OutputSchemaField[] {
  const result = z.array(OutputSchemaFieldSchema).safeParse(raw);
  return result.success ? result.data : [];
}

function buildPosition(row: NodeRow): { x: number; y: number } | undefined {
  if (row.position_x === null || row.position_y === null) return undefined;
  return { x: row.position_x, y: row.position_y };
}

export function assembleNode(row: NodeRow): Node {
  return {
    id: row.node_id,
    text: row.text,
    kind: row.kind,
    description: row.description,
    agent: row.agent ?? undefined,
    nextNodeIsUser: row.next_node_is_user ?? undefined,
    fallbackNodeId: row.fallback_node_id ?? undefined,
    global: row.global,
    defaultFallback: row.default_fallback ?? undefined,
    position: buildPosition(row),
    outputSchemaId: row.output_schema_id ?? undefined,
    outputPrompt: row.output_prompt ?? undefined,
  };
}

export function assembleNodes(rows: NodeRow[]): Node[] {
  return rows.map(assembleNode);
}

export function assembleAgents(rows: AgentRow[]): Agent[] {
  return rows.map((row) => ({
    id: row.agent_key,
    description: row.description,
  }));
}

function groupByEdgeId<T extends { edge_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();

  for (const row of rows) {
    const existing = map.get(row.edge_id);
    if (existing === undefined) {
      map.set(row.edge_id, [row]);
    } else {
      existing.push(row);
    }
  }

  return map;
}

function buildPreconditions(rows: EdgePreconditionRow[] | undefined): Precondition[] | undefined {
  if (rows === undefined || rows.length === EMPTY_LENGTH) return undefined;

  return rows.map((r) => ({
    type: r.type,
    value: r.value,
    description: r.description ?? undefined,
    toolFields: parseToolFields(r.tool_fields),
  }));
}

function buildContextPreconditions(
  rows: EdgeContextPreconditionRow[] | undefined
): ContextPreconditions | undefined {
  const first = rows?.[FIRST_INDEX];
  if (first === undefined) return undefined;

  return {
    preconditions: first.preconditions,
    jumpTo: first.jump_to ?? undefined,
  };
}

function buildSingleEdge(
  edgeRow: EdgeRow,
  preMap: Map<string, EdgePreconditionRow[]>,
  ctxMap: Map<string, EdgeContextPreconditionRow[]>
): Edge {
  return {
    from: edgeRow.from_node,
    to: edgeRow.to_node,
    preconditions: buildPreconditions(preMap.get(edgeRow.id)),
    contextPreconditions: buildContextPreconditions(ctxMap.get(edgeRow.id)),
  };
}

export function assembleEdges(
  edgeRows: EdgeRow[],
  preconditionRows: EdgePreconditionRow[],
  contextPreconditionRows: EdgeContextPreconditionRow[]
): Edge[] {
  const preMap = groupByEdgeId(preconditionRows);
  const ctxMap = groupByEdgeId(contextPreconditionRows);

  return edgeRows.map((edgeRow) => buildSingleEdge(edgeRow, preMap, ctxMap));
}

function buildTransport(row: McpServerRow): McpTransport {
  const raw = { type: row.transport_type, ...row.transport_config };
  return McpTransportSchema.parse(raw);
}

function parseVariableValues(
  raw: Record<string, unknown> | null
): Record<string, z.infer<typeof VariableValueSchema>> | undefined {
  if (raw === null) return undefined;
  const schema = z.record(z.string(), VariableValueSchema);
  const result = schema.safeParse(raw);
  return result.success ? result.data : undefined;
}

export function assembleMcpServers(rows: McpServerRow[]): McpServerConfig[] | undefined {
  if (rows.length === EMPTY_LENGTH) return undefined;

  return rows.map((row) => ({
    id: row.server_id,
    name: row.name,
    transport: buildTransport(row),
    enabled: row.enabled,
    libraryItemId: row.library_item_id ?? undefined,
    variableValues: parseVariableValues(row.variable_values),
  }));
}

export function assembleOutputSchemas(rows: OutputSchemaRow[]): OutputSchemaEntity[] | undefined {
  if (rows.length === EMPTY_LENGTH) return undefined;

  return rows.map((row) => ({
    id: row.schema_id,
    name: row.name,
    fields: parseOutputSchemaFields(row.fields),
  }));
}
