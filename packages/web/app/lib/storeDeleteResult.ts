const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

export interface AgentRef {
  id: string;
  slug: string;
  name: string;
}

export type DeleteStoreResult =
  | { ok: true }
  | { ok: false; reason: 'in_use'; draft: AgentRef[]; published: AgentRef[] }
  | { ok: false; reason: 'transient'; message: string }
  | { ok: false; reason: 'forbidden' }
  | { ok: false; reason: 'invalid' };

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

function isAgentRef(value: unknown): value is AgentRef {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.id === 'string' && typeof rec.slug === 'string' && typeof rec.name === 'string';
}

function parseAgentRefArray(value: unknown): AgentRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isAgentRef);
}

function buildInUseResult(body: unknown): DeleteStoreResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: 'in_use', draft: [], published: [] };
  }
  const rec = body as Record<string, unknown>;
  return {
    ok: false,
    reason: 'in_use',
    draft: parseAgentRefArray(rec.draft),
    published: parseAgentRefArray(rec.published),
  };
}

export function buildDeleteFailure(err: unknown): DeleteStoreResult {
  const parsed = parseBackendError(err);
  const fallback = err instanceof Error ? err.message : 'unknown';
  if (parsed === null) {
    return { ok: false, reason: 'transient', message: fallback };
  }
  if (parsed.status === HTTP_CONFLICT) return buildInUseResult(parsed.body);
  if (parsed.status === HTTP_FORBIDDEN) return { ok: false, reason: 'forbidden' };
  if (parsed.status === HTTP_BAD_REQUEST || parsed.status === HTTP_NOT_FOUND) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: false, reason: 'transient', message: fallback };
}
