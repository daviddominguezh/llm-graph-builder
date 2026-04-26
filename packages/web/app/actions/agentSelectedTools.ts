'use server';

import type { SelectedTool } from '@daviddh/llm-graph-runner';

import { fetchFromBackend } from '@/app/lib/backendProxy';

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_TOO_MANY = 429;

interface ConflictBody {
  currentUpdatedAt: string;
  currentTools: SelectedTool[];
}

export type UpdateSelectedToolsResult =
  | { ok: true; updatedAt: string; tools: SelectedTool[] }
  | {
      ok: false;
      kind: 'validation' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'transient';
      message: string;
      conflict?: ConflictBody;
    };

interface SuccessBody {
  selectedTools: SelectedTool[];
  updatedAt: string;
}

function parseSuccess(data: unknown): SuccessBody | null {
  if (typeof data !== 'object' || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (!Array.isArray(rec.selected_tools) || typeof rec.updated_at !== 'string') return null;
  return { selectedTools: rec.selected_tools as SelectedTool[], updatedAt: rec.updated_at };
}

function parseConflictBody(raw: unknown): ConflictBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.current_updated_at !== 'string' || !Array.isArray(rec.current_tools)) return null;
  return {
    currentUpdatedAt: rec.current_updated_at,
    currentTools: rec.current_tools as SelectedTool[],
  };
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

function failureKindForStatus(
  status: number
): 'validation' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'transient' {
  if (status === HTTP_BAD_REQUEST) return 'validation';
  if (status === HTTP_FORBIDDEN) return 'forbidden';
  if (status === HTTP_NOT_FOUND) return 'not_found';
  if (status === HTTP_CONFLICT) return 'conflict';
  if (status === HTTP_TOO_MANY) return 'rate_limited';
  return 'transient';
}

function buildFailure(err: unknown): UpdateSelectedToolsResult {
  const parsed = parseBackendError(err);
  const message = err instanceof Error ? err.message : 'unknown';
  if (parsed === null) {
    return { ok: false, kind: 'transient', message };
  }
  const kind = failureKindForStatus(parsed.status);
  const failure: UpdateSelectedToolsResult = { ok: false, kind, message };
  if (kind === 'conflict') {
    const conflict = parseConflictBody(parsed.body);
    if (conflict !== null) failure.conflict = conflict;
  }
  return failure;
}

export async function updateAgentSelectedToolsAction(
  agentId: string,
  tools: SelectedTool[],
  expectedUpdatedAt: string
): Promise<UpdateSelectedToolsResult> {
  try {
    const data = await fetchFromBackend(
      'PATCH',
      `/agents/${encodeURIComponent(agentId)}/selected-tools`,
      { tools, expectedUpdatedAt }
    );
    const success = parseSuccess(data);
    if (success === null) {
      return { ok: false, kind: 'transient', message: 'Malformed response' };
    }
    return { ok: true, updatedAt: success.updatedAt, tools: success.selectedTools };
  } catch (err) {
    return buildFailure(err);
  }
}
