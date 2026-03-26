/* ─── SSE event type ─── */

export interface SseEvent {
  type: string;
  [key: string]: unknown;
}

/* ─── Type-safe extraction helpers ─── */

const ZERO = 0;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function toStr(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function toOptStr(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function toNum(value: unknown): number {
  return typeof value === 'number' ? value : ZERO;
}

export function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item: unknown): item is string => typeof item === 'string');
}

/* ─── SSE line parser ─── */

export function parseSseLine(line: string): SseEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const json = trimmed.slice('data:'.length).trim();
  if (json === '') return null;
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed)) return null;
  const { type } = parsed;
  if (typeof type !== 'string') return null;
  return { ...parsed, type };
}

export function extractLineEvents(buffer: string): { events: SseEvent[]; remaining: string } {
  const lines = buffer.split('\n');
  const remaining = lines.pop() ?? '';
  const events = lines.map(parseSseLine).filter((e): e is SseEvent => e !== null);
  return { events, remaining };
}

export function parseTrailingBuffer(buffer: string): SseEvent[] {
  if (buffer.trim() === '') return [];
  const event = parseSseLine(buffer);
  return event === null ? [] : [event];
}
