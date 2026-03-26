import type { OutputSchemaEntity, OutputSchemaField, ToolFieldValue } from '@daviddh/graph-types';
import type { Edge as RFFlowEdge, Node as RFFlowNode } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import { checkPathCoverage, findUpstreamOutputNodes } from '../../utils/pathCoverage';
import type { ToolInputProperty } from '../../utils/typeCompatibility';
import { getCompatibleFields } from '../../utils/typeCompatibility';

type FlowNode = RFFlowNode<RFNodeData>;
type FlowEdge = RFFlowEdge<RFEdgeData>;

export interface UpstreamOption {
  nodeId: string;
  nodeName: string;
  fields: OutputSchemaField[];
}

export function getUpstreamOptions(
  nodes: FlowNode[],
  edges: FlowEdge[],
  sourceNode: string,
  outputSchemas: OutputSchemaEntity[],
  targetProp: ToolInputProperty
): UpstreamOption[] {
  const upstreamNodes = findUpstreamOutputNodes(nodes, edges, sourceNode);

  return upstreamNodes
    .map((node) => {
      const schema = outputSchemas.find((s) => s.id === node.data.outputSchemaId);
      if (schema === undefined) return null;
      const compatible = getCompatibleFields(schema.fields, targetProp);
      if (compatible.length === 0) return null;
      return { nodeId: node.id, nodeName: node.data.text || node.id, fields: compatible };
    })
    .filter((opt): opt is UpstreamOption => opt !== null);
}

type RefPartial = Partial<{ nodeId: string; path: string; fallbacks: ToolFieldValue[] }>;

export function isReferenceComplete(
  edges: FlowEdge[],
  target: string,
  ref: RefPartial,
  sourceFieldRequired: boolean,
  targetRequired: boolean
): boolean {
  if (ref.nodeId === undefined || ref.path === undefined) return false;

  const coverage = checkPathCoverage(edges, target, ref.nodeId);
  if (!coverage.covered) {
    if (ref.fallbacks === undefined || ref.fallbacks.length === 0) return false;
    return hasCoveringFallback(edges, target, ref.fallbacks);
  }

  if (!sourceFieldRequired && targetRequired) {
    return ref.fallbacks !== undefined && ref.fallbacks.length > 0;
  }

  return true;
}

function hasCoveringFallback(edges: FlowEdge[], target: string, fallbacks: ToolFieldValue[]): boolean {
  for (const fb of fallbacks) {
    if (fb.type === 'fixed') return true;
    if (fb.type === 'reference') {
      const fbCoverage = checkPathCoverage(edges, target, fb.nodeId);
      if (fbCoverage.covered) return true;
      if (fb.fallbacks !== undefined && hasCoveringFallback(edges, target, fb.fallbacks)) {
        return true;
      }
    }
  }
  return false;
}
