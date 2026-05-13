import type { SelectedTool } from '@daviddh/llm-graph-runner';
import type { Edge } from '@xyflow/react';

import type { Precondition, PreconditionType } from '../../schemas/graph.schema';
import type { RFEdgeData } from '../../utils/graphTransformers';
import { buildDeleteEdgeOp, buildUpdateEdgeOp } from '../../utils/operationBuilders';
import type { PushOperation } from '../../utils/operationBuilders';
import { makePrecondition, makeToolCallPrecondition } from '../../utils/preconditionHelpers';

export function pushUpdateEdge(
  from: string,
  to: string,
  data: RFEdgeData | undefined,
  pushOp: PushOperation
): void {
  pushOp(buildUpdateEdgeOp(from, to, data));
}

export function pushDeleteEdge(from: string, to: string, pushOp: PushOperation): void {
  pushOp(buildDeleteEdgeOp(from, to));
}

export interface EdgePreconditionInput {
  value: string;
  description: string;
  tool: SelectedTool | null;
}

function buildMergedEdge(e: Edge<RFEdgeData>, newPrecondition: Precondition): RFEdgeData {
  const existing = e.data?.preconditions ?? [];
  return { ...e.data, preconditions: [...existing, newPrecondition] };
}

function buildPrecondition(
  input: EdgePreconditionInput,
  preconditionType: PreconditionType
): Precondition | null {
  const description = input.description.trim() || undefined;
  if (preconditionType === 'tool_call') {
    if (!input.tool) return null;
    return makeToolCallPrecondition({ tool: input.tool, description });
  }
  if (!input.value.trim()) return null;
  return makePrecondition({ type: preconditionType, value: input.value.trim(), description });
}

export function pushTypeChangeOps(
  allSourceEdges: Array<Edge<RFEdgeData>>,
  multiEdgeInputs: Record<string, EdgePreconditionInput>,
  preconditionType: PreconditionType,
  pushOp: PushOperation
): void {
  for (const e of allSourceEdges) {
    const { [e.id]: input } = multiEdgeInputs;
    if (!input) continue;
    const newPrecondition = buildPrecondition(input, preconditionType);
    if (!newPrecondition) continue;
    const merged = buildMergedEdge(e, newPrecondition);
    pushOp(buildUpdateEdgeOp(e.source, e.target, merged));
  }
}
