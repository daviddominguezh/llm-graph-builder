import type { Edge, Graph, Node } from '@daviddh/graph-types';

/* ------------------------------------------------------------------ */
/*  Result types                                                       */
/* ------------------------------------------------------------------ */

export interface ReachabilityResult {
  reachable: string[];
  unreachable: string[];
  depthMap: Record<string, number>;
}

export interface PathResult {
  found: boolean;
  path: string[];
  edges: Edge[];
  length: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EMPTY_COUNT = 0;
const START_DEPTH = 0;
const DEPTH_INCREMENT = 1;
const PATH_OFFSET = 1;
const NOT_FOUND_LENGTH = 0;

/* ------------------------------------------------------------------ */
/*  bfsReachability                                                    */
/* ------------------------------------------------------------------ */

class BfsVisited {
  readonly ids: Set<string>;
  readonly depths: Record<string, number>;

  constructor(startNode: string) {
    this.ids = new Set<string>([startNode]);
    this.depths = { [startNode]: START_DEPTH };
  }

  visit(nodeId: string, depth: number): void {
    this.ids.add(nodeId);
    this.depths[nodeId] = depth;
  }

  has(nodeId: string): boolean {
    return this.ids.has(nodeId);
  }
}

function getUnvisitedNeighbours(nodeId: string, edges: Edge[], visited: BfsVisited): string[] {
  return edges.filter((e) => e.from === nodeId && !visited.has(e.to)).map((e) => e.to);
}

function expandBfsLevel(currentLevel: string[], edges: Edge[], depth: number, visited: BfsVisited): string[] {
  const next: string[] = [];
  for (const nodeId of currentLevel) {
    for (const neighbour of getUnvisitedNeighbours(nodeId, edges, visited)) {
      visited.visit(neighbour, depth);
      next.push(neighbour);
    }
  }
  return next;
}

export function bfsReachability(graph: Graph, fromNode: string, maxDepth?: number): ReachabilityResult {
  const visited = new BfsVisited(fromNode);
  let currentLevel: string[] = [fromNode];
  let depth = DEPTH_INCREMENT;
  const effectiveMax = maxDepth ?? Infinity;

  while (currentLevel.length > EMPTY_COUNT && depth <= effectiveMax) {
    currentLevel = expandBfsLevel(currentLevel, graph.edges, depth, visited);
    depth += DEPTH_INCREMENT;
  }

  const allNodeIds = graph.nodes.map((n) => n.id);
  const reachable = allNodeIds.filter((id) => visited.has(id));
  const unreachable = allNodeIds.filter((id) => !visited.has(id));

  return { reachable, unreachable, depthMap: visited.depths };
}

/* ------------------------------------------------------------------ */
/*  findShortestPath                                                   */
/* ------------------------------------------------------------------ */

class PathSearch {
  readonly visited: Set<string>;
  readonly parentMap: Map<string, string>;
  readonly queue: string[];
  readonly target: string;

  constructor(start: string, target: string) {
    this.visited = new Set<string>([start]);
    this.parentMap = new Map<string, string>();
    this.queue = [start];
    this.target = target;
  }

  visit(nodeId: string, parent: string): void {
    this.visited.add(nodeId);
    this.parentMap.set(nodeId, parent);
  }

  has(nodeId: string): boolean {
    return this.visited.has(nodeId);
  }
}

function reconstructPath(to: string, parentMap: Map<string, string>): string[] {
  const path: string[] = [];
  let current: string | undefined = to;
  while (current !== undefined) {
    path.unshift(current);
    current = parentMap.get(current);
  }
  return path;
}

function collectEdgesAlongPath(path: string[], edges: Edge[]): Edge[] {
  const result: Edge[] = [];
  for (let i = EMPTY_COUNT; i < path.length - PATH_OFFSET; i += DEPTH_INCREMENT) {
    const [from, to] = [path[i], path[i + PATH_OFFSET]];
    const edge = edges.find((e) => e.from === from && e.to === to);
    if (edge !== undefined) result.push(edge);
  }
  return result;
}

function processNode(current: string, edges: Edge[], search: PathSearch): string | undefined {
  for (const edge of edges) {
    if (edge.from !== current || search.has(edge.to)) continue;
    search.visit(edge.to, current);
    if (edge.to === search.target) return edge.to;
    search.queue.push(edge.to);
  }
  return undefined;
}

export function findShortestPath(graph: Graph, from: string, to: string): PathResult {
  if (from === to) {
    return { found: true, path: [from], edges: [], length: NOT_FOUND_LENGTH };
  }

  const search = new PathSearch(from, to);

  while (search.queue.length > EMPTY_COUNT) {
    const current = search.queue.shift();
    if (current === undefined) break;
    const found = processNode(current, graph.edges, search);
    if (found !== undefined) {
      const path = reconstructPath(to, search.parentMap);
      return {
        found: true,
        path,
        edges: collectEdgesAlongPath(path, graph.edges),
        length: path.length - PATH_OFFSET,
      };
    }
  }

  return { found: false, path: [], edges: [], length: NOT_FOUND_LENGTH };
}

/* ------------------------------------------------------------------ */
/*  getDeadEndNodes                                                    */
/* ------------------------------------------------------------------ */

function isTerminalNode(node: Node): boolean {
  return node.nextNodeIsUser === true || node.global;
}

export function getDeadEndNodes(graph: Graph): string[] {
  const outboundSet = new Set(graph.edges.map((e) => e.from));
  return graph.nodes.filter((n) => !outboundSet.has(n.id) && !isTerminalNode(n)).map((n) => n.id);
}

/* ------------------------------------------------------------------ */
/*  getOrphanNodeIds                                                   */
/* ------------------------------------------------------------------ */

function collectUnvisitedForward(current: string, edges: Edge[], visited: Set<string>): string[] {
  return edges.filter((e) => e.from === current && !visited.has(e.to)).map((e) => e.to);
}

function bfsForward(startNode: string, edges: Edge[]): Set<string> {
  const visited = new Set<string>([startNode]);
  const queue: string[] = [startNode];

  while (queue.length > EMPTY_COUNT) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const neighbour of collectUnvisitedForward(current, edges, visited)) {
      visited.add(neighbour);
      queue.push(neighbour);
    }
  }

  return visited;
}

export function getOrphanNodeIds(graph: Graph): string[] {
  const reachable = bfsForward(graph.startNode, graph.edges);
  return graph.nodes.map((n) => n.id).filter((id) => !reachable.has(id));
}
