import type { z } from 'zod';

export const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

const HTTP_NO_CONTENT = 204;

export type AccessTokenProvider = (orgId: string) => Promise<string>;

export interface CallCalendarArgs {
  getAccessToken: AccessTokenProvider;
  orgId: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

function buildUrl(path: string, query: Record<string, string> | undefined): string {
  const url = `${GOOGLE_CALENDAR_BASE}${path}`;
  if (query === undefined) return url;
  const params = new URLSearchParams(query);
  return `${url}?${params.toString()}`;
}

async function parseErrorResponse(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return `${String(res.status)} — ${text}`;
  } catch {
    return String(res.status);
  }
}

function buildInit(args: CallCalendarArgs, token: string): { init: RequestInit } {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  const init: RequestInit = { method: args.method, headers };
  if (args.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(args.body);
  }
  return { init };
}

async function performRequest(args: CallCalendarArgs): Promise<Response> {
  const token = await args.getAccessToken(args.orgId);
  const { init } = buildInit(args, token);
  const res = await fetch(buildUrl(args.path, args.query), init);
  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(`Google Calendar ${args.method} ${args.path}: ${message}`);
  }
  return res;
}

export async function callCalendarJson<T>(args: CallCalendarArgs, schema: z.ZodType<T>): Promise<T> {
  const res = await performRequest(args);
  if (res.status === HTTP_NO_CONTENT) {
    throw new Error(`Google Calendar ${args.method} ${args.path}: empty response body`);
  }
  const raw: unknown = await res.json();
  return schema.parse(raw);
}

export async function callCalendarVoid(args: CallCalendarArgs): Promise<void> {
  await performRequest(args);
}
