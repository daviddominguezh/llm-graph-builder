import type { Edge } from '@xyflow/react';

import type { Precondition, PreconditionType } from '../../schemas/graph.schema';
import type { RFEdgeData } from '../../utils/graphTransformers';
import { buildDeleteEdgeOp, buildUpdateEdgeOp } from '../../utils/operationBuilders';
import type { PushOperation } from '../../utils/operationBuilders';
import { makePrecondition } from '../../utils/preconditionHelpers';

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

interface EdgePreconditionInput {
  value: string;
  description: string;
}

function buildMergedEdge(e: Edge<RFEdgeData>, newPrecondition: Precondition): RFEdgeData {
  const existing = e.data?.preconditions ?? [];
  return { ...e.data, preconditions: [...existing, newPrecondition] };
}

export function pushTypeChangeOps(
  allSourceEdges: Array<Edge<RFEdgeData>>,
  multiEdgeInputs: Record<string, EdgePreconditionInput>,
  preconditionType: PreconditionType,
  pushOp: PushOperation
): void {
  for (const e of allSourceEdges) {
    const { [e.id]: input } = multiEdgeInputs;
    if (input.value.trim() === '') continue;

    const newPrecondition: Precondition = makePrecondition({
      type: preconditionType,
      value: input.value.trim(),
      description: input.description.trim(),
    });
    const merged = buildMergedEdge(e, newPrecondition);
    pushOp(buildUpdateEdgeOp(e.source, e.target, merged));
  }
}
