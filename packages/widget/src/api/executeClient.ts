import { readSseStream } from './sseReader.js';
import type { PublicExecutionEvent } from '../types/publicEvents.js';

const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN ?? 'https://app.openflow.build';

export interface ExecuteRequest {
  tenant: string;
  agent: string;
  version: number;
  tenantId: string;
  userId: string;
  sessionId: string;
  text: string;
}

function buildUrl(req: ExecuteRequest): string {
  const { tenant, agent, version } = req;
  return `${APP_ORIGIN}/api/chat/execute/${tenant}/${agent}/${String(version)}`;
}

function buildBody(req: ExecuteRequest): string {
  const { tenantId, userId, sessionId, text } = req;
  return JSON.stringify({
    tenantId,
    userId,
    sessionId,
    message: { text },
    channel: 'web',
    stream: true,
  });
}

export async function* execute(req: ExecuteRequest): AsyncGenerator<PublicExecutionEvent> {
  const url = buildUrl(req);
  const body = buildBody(req);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) throw new Error(`execute failed: ${res.status}`);
  if (res.body === null) throw new Error('execute returned no body');
  yield* readSseStream(res.body);
}
