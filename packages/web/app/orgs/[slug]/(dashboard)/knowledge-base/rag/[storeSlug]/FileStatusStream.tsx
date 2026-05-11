'use client';

import type { RagFileStatus } from '@/app/lib/ragFiles';
import { useEffect, useState } from 'react';

interface FileStatusStreamProps {
  fileId: string;
  storeId: string;
  initialStatus: RagFileStatus;
  initialError: string | null;
  onTerminal: () => void;
  children: (state: { status: RagFileStatus; error: string | null }) => React.ReactNode;
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

export function FileStatusStream({
  fileId,
  storeId,
  initialStatus,
  initialError,
  onTerminal,
  children,
}: FileStatusStreamProps): React.JSX.Element {
  const [status, setStatus] = useState<RagFileStatus>(initialStatus);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    if (TERMINAL.has(initialStatus)) return;
    const url = `/api/rag-files/${encodeURIComponent(fileId)}/stream?storeId=${encodeURIComponent(storeId)}`;
    const es = new EventSource(url);
    es.onmessage = (e: MessageEvent<string>) => {
      const data = parsePayload(e.data);
      if (data === null) return;
      if (data.status !== undefined) setStatus(data.status);
      if (data.statusError !== undefined) setError(data.statusError);
      if (data.status !== undefined && TERMINAL.has(data.status)) {
        es.close();
        onTerminal();
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => {
      es.close();
    };
  }, [fileId, storeId, initialStatus, onTerminal]);

  return <>{children({ status, error })}</>;
}
