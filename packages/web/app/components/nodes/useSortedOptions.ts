import { useStore } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import { useMemo } from 'react';

import type { RFEdgeData } from '../../utils/graphTransformers';

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sortOptionsByTargetY(options: Edge<RFEdgeData>[], ys: number[]): Edge<RFEdgeData>[] {
  return options
    .map((edge, i) => ({ edge, y: ys[i] ?? 0 }))
    .sort((a, b) => a.y - b.y)
    .map((entry) => entry.edge);
}

// Order a node's outgoing option edges by their target node's vertical position so
// the edges leaving each row don't cross. Subscribes narrowly (only re-sorts when a
// target node's Y actually changes) to avoid re-rendering every node on each drag frame.
export function useSortedOptions(
  id: string,
  rowMode: boolean,
  edges: Edge<RFEdgeData>[]
): Edge<RFEdgeData>[] {
  const options = useMemo(() => (rowMode ? edges.filter((e) => e.source === id) : []), [rowMode, edges, id]);
  const targetIds = useMemo(() => options.map((e) => e.target), [options]);
  const targetYs = useStore(
    (s) => targetIds.map((tid) => s.nodeLookup.get(tid)?.internals.positionAbsolute.y ?? 0),
    arraysEqual
  );
  return useMemo(() => sortOptionsByTargetY(options, targetYs), [options, targetYs]);
}
