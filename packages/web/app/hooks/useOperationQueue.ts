'use client';

import { useAgentsSidebar } from '@/app/components/agents/AgentsSidebarContext';
import { sendOperations } from '@/app/lib/graphApi';
import type { Operation } from '@daviddh/graph-types';
import { useCallback, useRef, useState } from 'react';

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

export function useOperationQueue(agentId: string | undefined): UseOperationQueueReturn {
  const { touchAgent } = useAgentsSidebar();
  const queueRef = useRef<Operation[]>([]);
  const flushGenRef = useRef(EMPTY_COUNT);
  const [pendingCount, setPendingCount] = useState(EMPTY_COUNT);
  const [flushSeq, setFlushSeq] = useState(EMPTY_COUNT);

  const pushOperation = useCallback((op: Operation) => {
    queueRef.current = [...queueRef.current, op];
    setPendingCount((prev) => prev + INCREMENT);
    setFlushSeq((s) => s + INCREMENT);
  }, []);

  const flush = useCallback(async () => {
    if (queueRef.current.length === EMPTY_COUNT) return;
    if (agentId === undefined) return;

    const gen = ++flushGenRef.current;
    const ops = [...queueRef.current];
    queueRef.current = [];

    try {
      await sendOperations(agentId, ops);
      setPendingCount(queueRef.current.length);
      touchAgent(agentId);
    } catch (error: unknown) {
      if (gen === flushGenRef.current) {
        queueRef.current = [...ops, ...queueRef.current];
      }
      setPendingCount(queueRef.current.length);
      throw error;
    }
  }, [agentId, touchAgent]);

  const clearQueue = useCallback(() => {
    flushGenRef.current++;
    queueRef.current = [];
    setPendingCount(EMPTY_COUNT);
  }, []);

  const hasPendingOps = pendingCount > EMPTY_COUNT;

  return { pushOperation, flush, hasPendingOps, pendingCount, flushSeq, clearQueue };
}
