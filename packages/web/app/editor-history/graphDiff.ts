import type { Operation } from '@daviddh/graph-types';
import type { Edge } from '@xyflow/react';

import type { RFEdgeData } from '../utils/graphTransformers';
import {
  buildDeleteEdgeOp,
  buildDeleteNodeOp,
  buildInsertEdgeOp,
  buildInsertNodeOp,
  buildUpdateEdgeOp,
  buildUpdateNodeOp,
} from '../utils/operationBuilders';
import type { HistorySnapshot } from './historyStore';

interface DiffResult {
  deletes: Operation[];
  upserts: Operation[];
}

// Edges are unique per (source, target); a null char cannot appear in node ids,
// so it is a collision-free key separator.
const EDGE_KEY_SEPARATOR = '\u0000';

function edgeKey(e: Edge<RFEdgeData>): string {
  return `${e.source}${EDGE_KEY_SEPARATOR}${e.target}`;
}

function diffNodes(before: HistorySnapshot, after: HistorySnapshot): DiffResult {
  const beforeById = new Map(before.nodes.map((n) => [n.id, n]));
  const afterById = new Map(after.nodes.map((n) => [n.id, n]));
  const deletes: Operation[] = [];
  const upserts: Operation[] = [];

  for (const n of before.nodes) {
    if (!afterById.has(n.id)) deletes.push(buildDeleteNodeOp(n.id));
  }
  for (const n of after.nodes) {
    const prev = beforeById.get(n.id);
    if (prev === undefined) {
      upserts.push(buildInsertNodeOp(n));
    } else if (prev !== n) {
      upserts.push(buildUpdateNodeOp(n));
    }
  }
  return { deletes, upserts };
}

function diffEdges(before: HistorySnapshot, after: HistorySnapshot): DiffResult {
  const beforeByKey = new Map(before.edges.map((e) => [edgeKey(e), e]));
  const afterByKey = new Map(after.edges.map((e) => [edgeKey(e), e]));
  const deletes: Operation[] = [];
  const upserts: Operation[] = [];

  for (const e of before.edges) {
    if (!afterByKey.has(edgeKey(e))) deletes.push(buildDeleteEdgeOp(e.source, e.target));
  }
  for (const e of after.edges) {
    const prev = beforeByKey.get(edgeKey(e));
    if (prev === undefined) {
      upserts.push(buildInsertEdgeOp(e.source, e.target, e.data));
    } else if (prev !== e) {
      upserts.push(buildUpdateEdgeOp(e.source, e.target, e.data));
    }
  }
  return { deletes, upserts };
}

/**
 * Operations that transform `before` into `after`. Used by undo: `before` is
 * the state being reverted (which the DB converges to via the serialized save
 * queue), `after` is the restored snapshot. Reference-equal entities emit
 * nothing — snapshots share object references with live state.
 */
export function diffGraphStates(before: HistorySnapshot, after: HistorySnapshot): Operation[] {
  const nodes = diffNodes(before, after);
  const edges = diffEdges(before, after);
  return [...edges.deletes, ...nodes.deletes, ...nodes.upserts, ...edges.upserts];
}
