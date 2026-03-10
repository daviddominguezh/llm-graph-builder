import type { Operation } from '@daviddh/graph-types';
import type { Edge, Node } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import type { Graph } from '../schemas/graph.schema';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { buildInsertEdgeOp, buildInsertNodeOp } from '../utils/operationBuilders';

type PushOperation = (op: Operation) => void;

const EMPTY_LENGTH = 0;

function isEmptyGraph(graphData: Graph | undefined): boolean {
  if (graphData === undefined) return true;
  return !Array.isArray(graphData.nodes) || graphData.nodes.length === EMPTY_LENGTH;
}

interface SeedInitialGraphOptions {
  graphData: Graph | undefined;
  nodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
  pushOperation: PushOperation;
  flush: () => Promise<void>;
}

/**
 * When the editor loads with no existing graph data (new agent),
 * pushes insert operations for the default nodes and edges
 * and flushes immediately so the initial graph is persisted.
 */
export function useSeedInitialGraph(opts: SeedInitialGraphOptions): void {
  const { graphData, nodes, edges, pushOperation, flush } = opts;
  const seeded = useRef(false);
  const t = useTranslations('editor');

  useEffect(() => {
    if (seeded.current) return;
    if (!isEmptyGraph(graphData)) return;

    seeded.current = true;

    for (const node of nodes) {
      pushOperation(buildInsertNodeOp(node));
    }
    for (const edge of edges) {
      pushOperation(buildInsertEdgeOp(edge.source, edge.target, edge.data));
    }

    void flush().catch(() => {
      toast.error(t('seedGraphFailed'));
      seeded.current = false;
    });
  }, [graphData, nodes, edges, pushOperation, flush, t]);
}
