import type { Operation } from '@daviddh/graph-types';
import type { Edge, Node } from '@xyflow/react';
import { useEffect, useRef } from 'react';

import type { Graph } from '../schemas/graph.schema';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { buildInsertEdgeOp, buildInsertNodeOp } from '../utils/operationBuilders';

type PushOperation = (op: Operation) => void;

/**
 * When the editor loads with no existing graph data (new agent),
 * pushes insert operations for the default nodes and edges so
 * they get persisted on the next auto-save flush.
 */
export function useSeedInitialGraph(
  graphData: Graph | undefined,
  nodes: Array<Node<RFNodeData>>,
  edges: Array<Edge<RFEdgeData>>,
  pushOperation: PushOperation
): void {
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    if (graphData !== undefined) return;

    seeded.current = true;

    for (const node of nodes) {
      pushOperation(buildInsertNodeOp(node));
    }
    for (const edge of edges) {
      pushOperation(buildInsertEdgeOp(edge.source, edge.target, edge.data));
    }
  }, [graphData, nodes, edges, pushOperation]);
}
