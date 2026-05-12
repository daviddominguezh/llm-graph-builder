'use client';

import type { RagFileStatus } from '@/app/lib/ragFiles';
import { useEffect } from 'react';

interface FileStatusSubscriberProps {
  storeId: string;
  fileId: string;
  onUpdate: (status: RagFileStatus, error: string | null) => void;
}

interface SsePayload {
  status?: RagFileStatus;
  statusError?: string | null;
}

const TERMINAL = new Set<RagFileStatus>(['done', 'failed']);

function isSsePayload(v: unknown): v is SsePayload {
  return typeof v === 'object' && v !== null;
}

function parsePayload(raw: string): SsePayload | null {
  try {
    const data: unknown = JSON.parse(raw);
    return isSsePayload(data) ? data : null;
  } catch {
    return null;
  }
}

export function FileStatusSubscriber({
  storeId,
  fileId,
  onUpdate,
}: FileStatusSubscriberProps): null {
  useEffect(() => {
    const url = `/api/rag-files/${encodeURIComponent(fileId)}/stream?storeId=${encodeURIComponent(storeId)}`;
    const es = new EventSource(url);
    es.onmessage = (e: MessageEvent<string>) => {
      const data = parsePayload(e.data);
      if (data === null) return;
      const status = data.status;
      const error = data.statusError ?? null;
      if (status !== undefined) onUpdate(status, error);
      if (status !== undefined && TERMINAL.has(status)) es.close();
    };
    es.onerror = () => {
      es.close();
    };
    return () => {
      es.close();
    };
  }, [fileId, storeId, onUpdate]);
  return null;
}
