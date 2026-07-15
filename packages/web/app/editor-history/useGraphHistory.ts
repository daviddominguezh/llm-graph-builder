'use client';

import type { Edge, Node } from '@xyflow/react';
import { useCallback, useState } from 'react';

import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import type { PushOperation } from '../utils/operationBuilders';
import { diffGraphStates } from './graphDiff';
import type { HistorySnapshot } from './historyStore';
import { EditorHistory } from './historyStore';

interface UseGraphHistoryParams {
  getState: () => HistorySnapshot;
  setNodes: (nodes: Array<Node<RFNodeData>>) => void;
  setEdges: (edges: Array<Edge<RFEdgeData>>) => void;
  pushOperation: PushOperation;
}

/**
 * Undo execution: pop the snapshot, restore it, and persist the state diff
 * through the operation queue. The queue's serialized flushing makes the DB
 * converge whether the undone action's ops were already flushed or still
 * queued (undo ops simply apply after them).
 */
export function useGraphHistory(params: UseGraphHistoryParams): {
  history: EditorHistory;
  undo: () => void;
} {
  const [history] = useState(() => new EditorHistory());

  const { getState, setNodes, setEdges, pushOperation } = params;

  const undo = useCallback(() => {
    const entry = history.pop();
    if (entry === undefined) return;

    const before = getState();
    setNodes(entry.nodes);
    setEdges(entry.edges);

    for (const op of diffGraphStates(before, entry)) {
      pushOperation(op);
    }
  }, [history, getState, setNodes, setEdges, pushOperation]);

  return { history, undo };
}
