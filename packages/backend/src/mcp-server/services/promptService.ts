import type { Edge, Graph, Node, Precondition } from '@daviddh/graph-types';

import { assembleGraph } from '../../db/queries/graphQueries.js';
import type { ServiceContext } from '../types.js';
import { requireGraph } from './graphReadHelpers.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PromptOption {
  index: number;
  targetNodeId: string;
  preconditionType: string;
  value: string;
  description?: string;
}

interface FallbackInfo {
  nodeId: string;
}

interface OutputSchemaInfo {
  id: string;
  name: string;
  fields: unknown[];
}

export interface NodePromptResult {
  nodeId: string;
  nodeText: string;
  kind: string;
  options: PromptOption[];
  fallback?: FallbackInfo;
  outputSchema?: OutputSchemaInfo;
  globalTools: string[];
  templateVariables: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const TEMPLATE_VAR_PATTERN = /\{(?<varName>[A-Z][A-Z_0-9]+)\}/gv;
const EMPTY_LENGTH = 0;
const INCREMENT = 1;

export function extractTemplateVariables(text: string): string[] {
  const matches = new Set<string>();
  let match: RegExpExecArray | null = TEMPLATE_VAR_PATTERN.exec(text);
  while (match !== null) {
    const name = match.groups?.varName;
    if (name !== undefined) matches.add(`{${name}}`);
    match = TEMPLATE_VAR_PATTERN.exec(text);
  }
  return [...matches];
}

function preconditionValue(p: Precondition): string {
  return p.type === 'tool_call' ? p.tool.toolName : p.value;
}

function buildOptions(edges: Edge[]): PromptOption[] {
  const options: PromptOption[] = [];
  let index = EMPTY_LENGTH;
  for (const edge of edges) {
    for (const p of edge.preconditions ?? []) {
      options.push({
        index,
        targetNodeId: edge.to,
        preconditionType: p.type,
        value: preconditionValue(p),
        description: p.description,
      });
      index += INCREMENT;
    }
  }
  return options;
}

function determineNodeKind(node: Node, outboundEdges: Edge[]): string {
  if (outboundEdges.length === EMPTY_LENGTH) return 'terminal';
  const types = new Set<string>();
  for (const edge of outboundEdges) {
    for (const p of edge.preconditions ?? []) {
      types.add(p.type);
    }
  }
  if (types.has('tool_call')) return 'tool_call';
  if (types.has('agent_decision')) return 'agent_decision';
  if (types.has('user_said')) return 'user_reply';
  return 'terminal';
}

function findOutputSchema(graph: Graph, node: Node): OutputSchemaInfo | undefined {
  if (node.outputSchemaId === undefined) return undefined;
  const schemas = graph.outputSchemas ?? [];
  const schema = schemas.find((s) => s.id === node.outputSchemaId);
  if (schema === undefined) return undefined;
  return { id: schema.id, name: schema.name, fields: schema.fields };
}

function getGlobalToolNames(graph: Graph): string[] {
  return graph.nodes.filter((n) => n.global && n.kind === 'agent').map((n) => n.id);
}

function buildFallback(node: Node): FallbackInfo | undefined {
  if (node.fallbackNodeId === undefined) return undefined;
  return { nodeId: node.fallbackNodeId };
}

/* ------------------------------------------------------------------ */
/*  Service function                                                   */
/* ------------------------------------------------------------------ */

export async function getNodePrompt(
  ctx: ServiceContext,
  agentId: string,
  nodeId: string
): Promise<NodePromptResult> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (node === undefined) throw new Error(`Node not found: ${nodeId}`);

  const outboundEdges = graph.edges.filter((e) => e.from === nodeId);

  return {
    nodeId: node.id,
    nodeText: node.text,
    kind: determineNodeKind(node, outboundEdges),
    options: buildOptions(outboundEdges),
    fallback: buildFallback(node),
    outputSchema: findOutputSchema(graph, node),
    globalTools: getGlobalToolNames(graph),
    templateVariables: extractTemplateVariables(node.text),
  };
}
