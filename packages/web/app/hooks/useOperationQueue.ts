'use client';

import { useAgentsSidebar } from '@/app/components/agents/AgentsSidebarContext';
import type { Operation } from '@daviddh/graph-types';
import type { RefObject } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { LocalGraphProvider } from '../utils/graphSaveDebug';
import { sendOperationsDebugged } from '../utils/graphSaveDebug';
import type { SendContext } from './operationQueueCore';
import { OperationQueueCore } from './operationQueueCore';

const EMPTY_COUNT = 0;
const INCREMENT = 1;

export interface UseOperationQueueReturn {
  pushOperation: (op: Operation) => void;
  flush: () => Promise<void>;
  hasPendingOps: boolean;
  pendingCount: number;
  flushSeq: number;
  clearQueue: () => void;
}

function sendBatch(ops: Operation[], ctx: SendContext, getPendingCount: () => number): Promise<void> {
  const { agentId } = ctx;
  if (agentId === undefined) return Promise.reject(new Error('Cannot save: agent id is not set'));
  return sendOperationsDebugged(agentId, ops, ctx.getLocalGraph, getPendingCount);
}

/**
 * Queue of graph mutations awaiting persistence.
 *
 * Flushes are strictly serialized and failed batches are requeued (never
 * silently dropped) — see OperationQueueCore. Every flush is instrumented
 * with before/payload/after debug logging via sendOperationsDebugged.
 */
export function useOperationQueue(
  agentId: string | undefined,
  localGraphRef?: RefObject<LocalGraphProvider>
): UseOperationQueueReturn {
  const { touchAgent } = useAgentsSidebar();
  const [pendingCount, setPendingCount] = useState(EMPTY_COUNT);
  const [flushSeq, setFlushSeq] = useState(EMPTY_COUNT);

  const [core] = useState(() => new OperationQueueCore(sendBatch, setPendingCount));

  useEffect(() => {
    core.setContext({
      agentId,
      getLocalGraph: () => localGraphRef?.current?.() ?? null,
    });
  }, [core, agentId, localGraphRef]);

  const pushOperation = useCallback(
    (op: Operation) => {
      core.push(op);
      setFlushSeq((s) => s + INCREMENT);
    },
    [core]
  );

  const flush = useCallback(async () => {
    if (agentId === undefined) return;
    const hadOps = core.getPendingCount() > EMPTY_COUNT;
    await core.flush();
    if (hadOps) touchAgent(agentId);
  }, [core, agentId, touchAgent]);

  const clearQueue = useCallback(() => {
    core.clear();
  }, [core]);

  const hasPendingOps = pendingCount > EMPTY_COUNT;

  return { pushOperation, flush, hasPendingOps, pendingCount, flushSeq, clearQueue };
}
