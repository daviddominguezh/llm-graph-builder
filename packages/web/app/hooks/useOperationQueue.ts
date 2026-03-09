'use client';

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
  clearQueue: () => void;
}

export function useOperationQueue(agentId: string | undefined): UseOperationQueueReturn {
  const queueRef = useRef<Operation[]>([]);
  const [pendingCount, setPendingCount] = useState(EMPTY_COUNT);

  const pushOperation = useCallback((op: Operation) => {
    queueRef.current = [...queueRef.current, op];
    setPendingCount((prev) => prev + INCREMENT);
  }, []);

  const flush = useCallback(async () => {
    if (queueRef.current.length === EMPTY_COUNT) return;
    if (agentId === undefined) return;

    const ops = [...queueRef.current];
    queueRef.current = [];
    setPendingCount(queueRef.current.length);

    try {
      await sendOperations(agentId, ops);
    } catch (error: unknown) {
      queueRef.current = [...ops, ...queueRef.current];
      setPendingCount(queueRef.current.length);
      throw error;
    }
  }, [agentId]);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    setPendingCount(EMPTY_COUNT);
  }, []);

  const hasPendingOps = pendingCount > EMPTY_COUNT;

  return { pushOperation, flush, hasPendingOps, pendingCount, clearQueue };
}
