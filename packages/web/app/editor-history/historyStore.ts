import type { Edge, Node } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';

export interface HistorySnapshot {
  nodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
}

export interface HistoryEntry extends HistorySnapshot {
  /** Entries with the same key merge: the oldest pre-state wins (typing bursts = one undo). */
  coalesceKey?: string;
}

const DEFAULT_CAP = 100;
const STACK_START = 0;
const LAST_INDEX = -1;

/**
 * FE-only undo stack for the graph editor. Entries are SHALLOW copies of
 * immutably-updated React state — node/edge objects are shared between
 * entries (structural sharing), so pushes are O(n) pointer copies and
 * restoring a snapshot re-renders only the nodes that actually changed.
 */
export class EditorHistory {
  private stack: HistoryEntry[] = [];

  constructor(private readonly cap = DEFAULT_CAP) {}

  push(entry: HistoryEntry): void {
    const top = this.stack.at(LAST_INDEX);
    if (entry.coalesceKey !== undefined && top?.coalesceKey === entry.coalesceKey) return;

    this.stack = [...this.stack, { ...entry, nodes: [...entry.nodes], edges: [...entry.edges] }];
    if (this.stack.length > this.cap) {
      this.stack = this.stack.slice(this.stack.length - this.cap);
    }
  }

  pop(): HistoryEntry | undefined {
    const top = this.stack.at(LAST_INDEX);
    this.stack = this.stack.slice(STACK_START, LAST_INDEX);
    return top;
  }

  clear(): void {
    this.stack = [];
  }

  get depth(): number {
    return this.stack.length;
  }
}
