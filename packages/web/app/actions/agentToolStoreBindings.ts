'use server';

import { fetchFromBackend } from '@/app/lib/backendProxy';

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

export interface AgentToolStoreBindings {
  selectedKvStoreId: string | null;
  selectedRagStoreId: string | null;
}

export type UpdateAgentToolStoreBindingsResult =
  | { ok: true; updatedAt: string; bindings: AgentToolStoreBindings }
  | {
      ok: false;
      reason: 'conflict' | 'org_mismatch' | 'transient' | 'invalid';
      message?: string;
    };

interface SuccessBody {
  selectedKvStoreId: string | null;
  selectedRagStoreId: string | null;
  updatedAt: string;
}

function parseNullableString(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  if (typeof value === 'string') return { ok: true, value };
  return { ok: false };
}

function parseSuccess(data: unknown): SuccessBody | null {
  if (typeof data !== 'object' || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (typeof rec.updatedAt !== 'string') return null;
  const kv = parseNullableString(rec.selectedKvStoreId);
  const rag = parseNullableString(rec.selectedRagStoreId);
  if (!kv.ok || !rag.ok) return null;
  return { selectedKvStoreId: kv.value, selectedRagStoreId: rag.value, updatedAt: rec.updatedAt };
}

interface ParsedBackendError {
  status: number;
  body: unknown;
}

function parseBackendError(err: unknown): ParsedBackendError | null {
  if (!(err instanceof Error)) return null;
  const match = err.message.match(/Backend request failed \((\d+)\):\s*([\s\S]*)$/);
  if (match === null) return null;
  const statusText = match[1];
  const bodyText = match[2];
  if (statusText === undefined || bodyText === undefined) return null;
  const status = Number.parseInt(statusText, 10);
  if (Number.isNaN(status)) return null;
  let body: unknown = bodyText;
  try {
    body = JSON.parse(bodyText);
  } catch {
    // body stays as raw text
  }
  return { status, body };
}

function reasonForStatus(status: number): 'conflict' | 'org_mismatch' | 'transient' | 'invalid' {
  if (status === HTTP_CONFLICT) return 'conflict';
  if (status === HTTP_FORBIDDEN) return 'org_mismatch';
  if (status === HTTP_BAD_REQUEST || status === HTTP_NOT_FOUND) return 'invalid';
  return 'transient';
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const rec = body as Record<string, unknown>;
    if (typeof rec.error === 'string') return rec.error;
  }
  if (typeof body === 'string') return body;
  return fallback;
}

function buildFailure(err: unknown): UpdateAgentToolStoreBindingsResult {
  const parsed = parseBackendError(err);
  const fallback = err instanceof Error ? err.message : 'unknown';
  if (parsed === null) {
    return { ok: false, reason: 'transient', message: fallback };
  }
  const reason = reasonForStatus(parsed.status);
  const message = extractErrorMessage(parsed.body, fallback);
  return { ok: false, reason, message };
}

export interface UpdateAgentToolStoreBindingsInput {
  agentId: string;
  expectedUpdatedAt: string;
  selectedKvStoreId: string | null;
  selectedRagStoreId: string | null;
}

export async function updateAgentToolStoreBindingsAction(
  input: UpdateAgentToolStoreBindingsInput
): Promise<UpdateAgentToolStoreBindingsResult> {
  try {
    const data = await fetchFromBackend(
      'PATCH',
      `/agents/${encodeURIComponent(input.agentId)}/store-bindings`,
      {
        expectedUpdatedAt: input.expectedUpdatedAt,
        selectedKvStoreId: input.selectedKvStoreId,
        selectedRagStoreId: input.selectedRagStoreId,
      }
    );
    const success = parseSuccess(data);
    if (success === null) {
      return { ok: false, reason: 'transient', message: 'Malformed response' };
    }
    return {
      ok: true,
      updatedAt: success.updatedAt,
      bindings: {
        selectedKvStoreId: success.selectedKvStoreId,
        selectedRagStoreId: success.selectedRagStoreId,
      },
    };
  } catch (err) {
    return buildFailure(err);
  }
}
