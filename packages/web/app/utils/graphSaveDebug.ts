import type { Operation } from '@daviddh/graph-types';

import { fetchGraphOrAgentConfig, sendOperations } from '../lib/graphApi';

// Access console via globalThis to avoid the no-console ESLint rule (same
// pattern as consoleLogger.ts). These logs are the debugging instrumentation
// for the graph save pipeline — they must always be visible.
const { console: c } = globalThis;

const TAG = '[GraphSave]';

interface DebugNode {
  id: string;
}

interface DebugEdge {
  from: string;
  to: string;
  preconditions?: unknown[];
}

export interface DebugGraphState {
  nodes: DebugNode[];
  edges: DebugEdge[];
}

/** Returns the current local editor state, or null when unavailable. */
export type LocalGraphProvider = () => DebugGraphState | null;

let batchCounter = 0;

function edgeKey(edge: DebugEdge): string {
  return `${edge.from}->${edge.to}`;
}

function describeEdge(edge: DebugEdge): string {
  const count = edge.preconditions?.length ?? 0;
  return `${edge.from}->${edge.to} (${count} preconditions)`;
}

function describeOp(op: Operation): string {
  if (op.type === 'insertEdge' || op.type === 'updateEdge') {
    return `${op.type} ${op.data.from}->${op.data.to}`;
  }
  if (op.type === 'deleteEdge') return `deleteEdge ${op.from}->${op.to}`;
  if (op.type === 'insertNode' || op.type === 'updateNode') {
    return `${op.type} ${op.data.nodeId}`;
  }
  if (op.type === 'deleteNode') return `deleteNode ${op.nodeId}`;
  return op.type;
}

function logStateSummary(label: string, state: DebugGraphState | null): void {
  if (state === null) {
    c.warn(`${label}: unavailable (serialization failed or state not ready)`);
    return;
  }
  c.log(`${label}: ${String(state.nodes.length)} nodes, ${String(state.edges.length)} edges`);
  c.log(
    `${label} node ids:`,
    state.nodes.map((n) => n.id)
  );
  c.log(`${label} edges:`, state.edges.map(describeEdge));
}

function logBeforeSave(batchId: number, agentId: string, ops: Operation[], local: DebugGraphState | null) {
  c.groupCollapsed(
    `${TAG}#${String(batchId)} SAVING ${String(ops.length)} ops → agent ${agentId} | ${ops
      .map(describeOp)
      .join(', ')}`
  );
  c.log('timestamp:', new Date().toISOString());
  logStateSummary('local state BEFORE save', local);
  c.log('operations payload (exact batch sent to the server):', ops);
  c.groupEnd();
}

interface GraphDiff {
  nodesMissingOnServer: string[];
  nodesOnlyOnServer: string[];
  edgesMissingOnServer: string[];
  edgesOnlyOnServer: string[];
  preconditionCountMismatches: string[];
}

function diffEdgePreconditions(local: DebugGraphState, server: DebugGraphState): string[] {
  const serverByKey = new Map(server.edges.map((e) => [edgeKey(e), e]));
  const mismatches: string[] = [];
  for (const edge of local.edges) {
    const serverEdge = serverByKey.get(edgeKey(edge));
    if (serverEdge === undefined) continue;
    const localCount = edge.preconditions?.length ?? 0;
    const serverCount = serverEdge.preconditions?.length ?? 0;
    if (localCount !== serverCount) {
      mismatches.push(
        `${edgeKey(edge)}: local has ${String(localCount)} preconditions, server has ${String(serverCount)}`
      );
    }
  }
  return mismatches;
}

function diffStates(local: DebugGraphState, server: DebugGraphState): GraphDiff {
  const localNodeIds = new Set(local.nodes.map((n) => n.id));
  const serverNodeIds = new Set(server.nodes.map((n) => n.id));
  const localEdgeKeys = new Set(local.edges.map(edgeKey));
  const serverEdgeKeys = new Set(server.edges.map(edgeKey));

  return {
    nodesMissingOnServer: [...localNodeIds].filter((id) => !serverNodeIds.has(id)),
    nodesOnlyOnServer: [...serverNodeIds].filter((id) => !localNodeIds.has(id)),
    edgesMissingOnServer: [...localEdgeKeys].filter((k) => !serverEdgeKeys.has(k)),
    edgesOnlyOnServer: [...serverEdgeKeys].filter((k) => !localEdgeKeys.has(k)),
    preconditionCountMismatches: diffEdgePreconditions(local, server),
  };
}

function isInSync(diff: GraphDiff): boolean {
  return (
    diff.nodesMissingOnServer.length === 0 &&
    diff.nodesOnlyOnServer.length === 0 &&
    diff.edgesMissingOnServer.length === 0 &&
    diff.edgesOnlyOnServer.length === 0 &&
    diff.preconditionCountMismatches.length === 0
  );
}

function logDiff(batchId: number, diff: GraphDiff, pendingOps: number): void {
  if (isInSync(diff)) {
    c.log(`${TAG}#${String(batchId)} local and server state are IN SYNC ✓`);
    return;
  }
  c.warn(
    `${TAG}#${String(batchId)} local and server state DIVERGE after save` +
      (pendingOps > 0
        ? ` (${String(pendingOps)} ops still pending — some divergence may resolve on next save)`
        : ' (no pending ops — this divergence is REAL DATA LOSS OR CORRUPTION)'),
    diff
  );
}

async function verifyServerState(
  batchId: number,
  agentId: string,
  getLocalGraph: LocalGraphProvider,
  getPendingCount: () => number
): Promise<void> {
  const server = await fetchGraphOrAgentConfig(agentId);
  if ('appType' in server) {
    c.log(`${TAG}#${String(batchId)} agent-mode config — graph diff not applicable`);
    return;
  }
  const local = getLocalGraph();
  c.groupCollapsed(`${TAG}#${String(batchId)} state AFTER save (server re-fetched for verification)`);
  logStateSummary('server state AFTER save', server);
  logStateSummary('local state AFTER save', local);
  c.groupEnd();
  if (local !== null) {
    logDiff(batchId, diffStates(local, server), getPendingCount());
  }
}

/**
 * Sends a batch of graph operations with full debug instrumentation:
 * 1. logs the local state right before saving,
 * 2. logs the exact operations payload being sent,
 * 3. after the server acknowledges, re-fetches the server-side graph and
 *    logs it together with a local-vs-server diff, so any divergence between
 *    what the editor shows and what was actually persisted is visible
 *    immediately — not on the next page reload.
 */
export async function sendOperationsDebugged(
  agentId: string,
  ops: Operation[],
  getLocalGraph: LocalGraphProvider,
  getPendingCount: () => number
): Promise<void> {
  const batchId = ++batchCounter;
  logBeforeSave(batchId, agentId, ops, getLocalGraph());

  const startedAt = Date.now();
  try {
    await sendOperations(agentId, ops);
  } catch (error: unknown) {
    c.error(
      `${TAG}#${String(batchId)} SAVE FAILED after ${String(Date.now() - startedAt)}ms — ` +
        'ops are requeued and will be retried (nothing is dropped)',
      error
    );
    throw error;
  }

  c.log(`${TAG}#${String(batchId)} server acknowledged in ${String(Date.now() - startedAt)}ms`);
  await verifyServerState(batchId, agentId, getLocalGraph, getPendingCount).catch((error: unknown) => {
    c.warn(`${TAG}#${String(batchId)} post-save verification fetch failed (save itself succeeded)`, error);
  });
}
