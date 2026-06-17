import { ToolError } from '@daviddh/llm-graph-runner';
import type { Response } from 'express';
import type { ZodSafeParseResult } from 'zod';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL = 500;

export interface ToolErrorPayload {
  ok: false;
  error: { code: string; message: string };
}

export interface ToolOkPayload<T> {
  ok: true;
  result: T;
}

export function parseOrReject<T>(res: Response, parsed: ZodSafeParseResult<T>): T | null {
  if (parsed.success) return parsed.data;
  const payload: ToolErrorPayload = {
    ok: false,
    error: { code: 'invalid_request', message: parsed.error.message },
  };
  res.status(HTTP_BAD_REQUEST).json(payload);
  return null;
}

export async function runTool<T>(res: Response, op: () => Promise<T>): Promise<void> {
  try {
    const result = await op();
    const payload: ToolOkPayload<T> = { ok: true, result };
    res.status(HTTP_OK).json(payload);
  } catch (err) {
    if (err instanceof ToolError) {
      const payload: ToolErrorPayload = { ok: false, error: { code: err.code, message: err.message } };
      res.status(HTTP_OK).json(payload);
      return;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    const payload: ToolErrorPayload = { ok: false, error: { code: 'internal_error', message } };
    res.status(HTTP_INTERNAL).json(payload);
  }
}
