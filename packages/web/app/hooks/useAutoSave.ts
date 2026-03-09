import { saveStagingAction } from '@/app/actions/agents';
import type { Graph } from '@/app/schemas/graph.schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

const AUTO_SAVE_DELAY_MS = 10000;

interface UseAutoSaveOptions {
  agentId: string | undefined;
  getGraphData: () => Graph | null;
  enabled: boolean;
}

interface UseAutoSaveReturn {
  pendingSave: boolean;
}

interface SaveCallbacks {
  getLastSaved: () => string;
  setLastSaved: (value: string) => void;
  setPendingSave: (value: boolean) => void;
}

interface DebounceOptions {
  enabled: boolean;
  agentId: string | undefined;
  getGraphData: () => Graph | null;
  callbacks: SaveCallbacks;
}

interface SerializeResult {
  graphData: Graph;
  serialized: string;
}

function serializeGraph(getGraphData: () => Graph | null): SerializeResult | null {
  const graphData = getGraphData();
  if (graphData === null) return null;
  return { graphData, serialized: JSON.stringify(graphData) };
}

function executeSave(agentId: string, graphData: Graph, serialized: string, cb: SaveCallbacks): void {
  void saveStagingAction(agentId, graphData).then(({ error }) => {
    if (error !== null) {
      toast.error('Auto-save failed');
      return;
    }
    cb.setLastSaved(serialized);
    cb.setPendingSave(false);
  });
}

function useSaveCallback(
  agentId: string | undefined,
  getGraphData: () => Graph | null,
  cb: SaveCallbacks
): () => void {
  return useCallback(() => {
    if (agentId === undefined || agentId === '') return;
    const result = serializeGraph(getGraphData);
    if (result === null || result.serialized === cb.getLastSaved()) {
      cb.setPendingSave(false);
      return;
    }

    executeSave(agentId, result.graphData, result.serialized, cb);
  }, [agentId, getGraphData, cb]);
}

function computeSerialized(options: DebounceOptions): string | null {
  const { enabled, agentId, getGraphData } = options;
  const hasAgent = agentId !== undefined && agentId !== '';
  if (!enabled || !hasAgent) return null;
  const result = serializeGraph(getGraphData);
  return result?.serialized ?? null;
}

function useDebounceEffect(options: DebounceOptions, doSave: () => void): void {
  const { callbacks } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const serialized = computeSerialized(options);

  useEffect(() => {
    if (serialized === null || serialized === callbacks.getLastSaved()) return;

    callbacks.setPendingSave(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doSave, AUTO_SAVE_DELAY_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [serialized, doSave, callbacks]);
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

function useInitialSnapshot(getGraphData: () => Graph | null): string {
  const ref = useRef<string | null>(null);
  ref.current ??= serializeGraph(getGraphData)?.serialized ?? '';
  return ref.current;
}

export function useAutoSave({ agentId, getGraphData, enabled }: UseAutoSaveOptions): UseAutoSaveReturn {
  const initialSnapshot = useInitialSnapshot(getGraphData);
  const lastSavedRef = useRef<string>(initialSnapshot);
  const [pendingSave, setPendingSave] = useState(false);

  const callbacks: SaveCallbacks = useMemo(
    () => ({
      getLastSaved: () => lastSavedRef.current,
      setLastSaved: (value: string) => {
        lastSavedRef.current = value;
      },
      setPendingSave,
    }),
    [setPendingSave]
  );

  const doSave = useSaveCallback(agentId, getGraphData, callbacks);
  useDebounceEffect({ enabled, agentId, getGraphData, callbacks }, doSave);
  useBeforeUnloadWarning(pendingSave);

  return { pendingSave };
}
