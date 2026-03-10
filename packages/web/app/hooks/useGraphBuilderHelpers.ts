import type { Edge, ReactFlowInstance } from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';

import type { Graph } from '../schemas/graph.schema';
import type { ContextPrecondition } from '../types/contextPrecondition';
import { defaultStartNode } from '../utils/graphInitializer';
import type { RFEdgeData } from '../utils/graphTransformers';
import { calculateInitialViewport, findInitialNodePosition } from '../utils/loadGraphData';

const EMPTY_LENGTH = 0;

function resolveInitialPosition(initialGraphData: Graph | undefined): { x: number; y: number } | null {
  if (initialGraphData?.nodes === undefined || initialGraphData.nodes.length === EMPTY_LENGTH) {
    return defaultStartNode.position;
  }
  return findInitialNodePosition(initialGraphData);
}

export function useInitialViewport(
  wrapper: React.RefObject<HTMLDivElement | null>,
  setViewport: ReactFlowInstance['setViewport'],
  initialGraphData: Graph | undefined
): void {
  useEffect(() => {
    if (wrapper.current === null) return;
    const initialPos = resolveInitialPosition(initialGraphData);

    if (initialPos === null) return;
    const viewport = calculateInitialViewport(initialPos, wrapper.current.clientHeight);
    void setViewport(viewport);
  }, [setViewport, wrapper, initialGraphData]);
}

export function useSearchKeyboard(setSearchOpen: (fn: (prev: boolean) => boolean) => void): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        setSearchOpen(() => false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [setSearchOpen]);
}

interface ContextPreconditionsReturn {
  customContextPreconditions: ContextPrecondition[];
  setCustomContextPreconditions: React.Dispatch<React.SetStateAction<ContextPrecondition[]>>;
  allContextPreconditions: string[];
}

function collectEdgePreconditions(edges: Array<Edge<RFEdgeData>>): Set<string> {
  const set = new Set<string>();
  for (const edge of edges) {
    const cp = edge.data?.contextPreconditions;
    if (cp !== undefined) {
      cp.preconditions.forEach((p: string) => set.add(p));
    }
  }
  return set;
}

export function useContextPreconditions(edges: Array<Edge<RFEdgeData>>): ContextPreconditionsReturn {
  const [custom, setCustom] = useState<ContextPrecondition[]>([]);

  const edgeCtx = useMemo(() => collectEdgePreconditions(edges), [edges]);

  const all = useMemo(() => {
    const merged = new Set([...custom.map((p) => p.name), ...edgeCtx]);
    return Array.from(merged).sort();
  }, [custom, edgeCtx]);

  return {
    customContextPreconditions: custom,
    setCustomContextPreconditions: setCustom,
    allContextPreconditions: all,
  };
}
