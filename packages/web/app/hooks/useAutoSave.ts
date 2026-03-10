import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const AUTO_SAVE_DELAY_MS = 5000;

export interface UseAutoSaveOptions {
  hasPendingOps: boolean;
  flushSeq: number;
  flush: () => Promise<void>;
  enabled: boolean;
}

export interface UseAutoSaveReturn {
  pendingSave: boolean;
}

function useBeforeUnloadWarning(pendingSave: boolean): void {
  useEffect(() => {
    if (!pendingSave) return undefined;

    function handleBeforeUnload(e: BeforeUnloadEvent): void {
      e.preventDefault();
    }

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [pendingSave]);
}

function useFlushEffect(
  flushSeq: number,
  hasPendingOps: boolean,
  enabled: boolean,
  doFlush: () => void
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !hasPendingOps) return;

    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doFlush, AUTO_SAVE_DELAY_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [flushSeq, hasPendingOps, enabled, doFlush]);
}

export function useAutoSave({
  hasPendingOps,
  flushSeq,
  flush,
  enabled,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const t = useTranslations('editor');
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retrySeq, setRetrySeq] = useState(0);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => setRetrySeq((s) => s + 1), AUTO_SAVE_DELAY_MS);
  }, []);

  const doFlush = useCallback(() => {
    void flush().catch(() => {
      toast.error(t('autoSaveFailed'));
      scheduleRetry();
    });
  }, [flush, t, scheduleRetry]);

  useFlushEffect(flushSeq + retrySeq, hasPendingOps, enabled, doFlush);
  useBeforeUnloadWarning(hasPendingOps);

  return { pendingSave: hasPendingOps };
}
