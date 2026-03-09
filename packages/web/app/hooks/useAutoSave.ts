import { saveStagingAction } from '@/app/actions/agents';
import type { Graph } from '@/app/schemas/graph.schema';
import { useCallback, useEffect, useRef, useState } from 'react';
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

function serializeGraph(getGraphData: () => Graph | null): string | null {
  const graphData = getGraphData();
  if (graphData === null) return null;
  return JSON.stringify(graphData);
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
    const serialized = serializeGraph(getGraphData);
    if (serialized === null || serialized === cb.getLastSaved()) {
      cb.setPendingSave(false);
      return;
    }

    const graphData = getGraphData();
    if (graphData === null) return;

    executeSave(agentId, graphData, serialized, cb);
  }, [agentId, getGraphData, cb]);
}

function computeSerialized(options: DebounceOptions): string | null {
  const { enabled, agentId, getGraphData } = options;
  const hasAgent = agentId !== undefined && agentId !== '';
  return enabled && hasAgent ? serializeGraph(getGraphData) : null;
}

function useDebounceEffect(options: DebounceOptions, doSave: () => void): void {
  const { callbacks } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const serialized = computeSerialized(options);
    if (serialized === null || serialized === callbacks.getLastSaved()) return undefined;

    callbacks.setPendingSave(true);

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(doSave, AUTO_SAVE_DELAY_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }); // No deps — runs every render to detect changes
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
  ref.current ??= serializeGraph(getGraphData) ?? '';
  return ref.current;
}

export function useAutoSave({ agentId, getGraphData, enabled }: UseAutoSaveOptions): UseAutoSaveReturn {
  const initialSnapshot = useInitialSnapshot(getGraphData);
  const lastSavedRef = useRef<string>(initialSnapshot);
  const [pendingSave, setPendingSave] = useState(false);

  const callbacks: SaveCallbacks = {
    getLastSaved: () => lastSavedRef.current,
    setLastSaved: (value: string) => {
      lastSavedRef.current = value;
    },
    setPendingSave,
  };

  const doSave = useSaveCallback(agentId, getGraphData, callbacks);
  useDebounceEffect({ enabled, agentId, getGraphData, callbacks }, doSave);
  useBeforeUnloadWarning(pendingSave);

  return { pendingSave };
}
