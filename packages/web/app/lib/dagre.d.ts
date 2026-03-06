export interface DagreNodeLabel {
  width: number;
  height: number;
  label: string;
}

export interface DagreNodeResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DagreGraphOptions {
  rankdir: string;
  nodesep: number;
  ranksep: number;
  marginx: number;
  marginy: number;
}

export interface DagreGraph {
  setGraph: (options: DagreGraphOptions) => void;
  setDefaultEdgeLabel: (fn: () => Record<string, never>) => void;
  setNode: (id: string, label: DagreNodeLabel) => void;
  setEdge: (from: string, to: string) => void;
  nodes: () => string[];
  node: (id: string) => DagreNodeResult | undefined;
}

export interface DagreLib {
  graphlib: {
    Graph: new () => DagreGraph;
  };
  layout: (graph: DagreGraph) => void;
}

export declare const dagre: DagreLib;
