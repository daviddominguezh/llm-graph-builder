import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

const AUTO_SAVE_DELAY_MS = 10000;

export interface UseAutoSaveOptions {
  hasPendingOps: boolean;
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

function useFlushEffect(hasPendingOps: boolean, enabled: boolean, doFlush: () => void): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !hasPendingOps) return;

    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doFlush, AUTO_SAVE_DELAY_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [hasPendingOps, enabled, doFlush]);
}

export function useAutoSave({ hasPendingOps, flush, enabled }: UseAutoSaveOptions): UseAutoSaveReturn {
  const t = useTranslations('editor');

  const doFlush = useCallback(() => {
    void flush().catch(() => {
      toast.error(t('autoSaveFailed'));
    });
  }, [flush, t]);

  useFlushEffect(hasPendingOps, enabled, doFlush);
  useBeforeUnloadWarning(hasPendingOps);

  return { pendingSave: hasPendingOps };
}
