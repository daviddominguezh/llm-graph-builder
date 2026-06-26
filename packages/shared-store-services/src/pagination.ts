// Uniform opaque-cursor pagination primitives shared by every KV + RAG search
// mode. The LLM never sees the per-mode continuation — it round-trips an opaque
// token. `total`/`offset` are intentionally absent: forward-only paging by
// match count, "is there more?" == nextCursor != null.

export interface SearchPage<T> {
  items: T[];
  limit: number;
  nextCursor: string | null;
}

export interface KvKeysetCursor {
  lastKey: string;
}

export interface KvRegexScanCursor {
  lastKey: string;
}

export interface RagPoolCursor {
  poolIndex: number;
}

const BYTES_PER_KIB = 1024;
const KIB_PER_MIB = 1024;
const KV_SCAN_BYTE_BUDGET_MIB = 4;

export const KV_SCAN_PAGE_SIZE = 500;
export const KV_SCAN_ROW_BUDGET = 5000;
export const KV_SCAN_BYTE_BUDGET = KV_SCAN_BYTE_BUDGET_MIB * KIB_PER_MIB * BYTES_PER_KIB;

const INVALID_CURSOR = 'invalid cursor';

export function encodeCursor(payload: unknown): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf8').toString('base64url');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCursorJson(cursor: string): Record<string, unknown> {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (!isPlainObject(parsed)) {
      throw new Error(INVALID_CURSOR);
    }
    return parsed;
  } catch (cause) {
    throw new Error(INVALID_CURSOR, { cause });
  }
}

// Decode an opaque token back to its payload. By default the shape is trusted
// (the codec is the only producer); callers handling untrusted tokens can pass
// a type-guard to validate the decoded object before it is returned as `P`.
export function decodeCursor<P extends object>(
  cursor: string,
  guard: (value: object) => value is P = (_value): _value is P => true
): P {
  const parsed = parseCursorJson(cursor);
  if (!guard(parsed)) {
    throw new Error(INVALID_CURSOR);
  }
  return parsed;
}
