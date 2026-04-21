import type { Request, Response } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

export const HTTP_OK = 200;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_NOT_FOUND = 404;
export const HTTP_INTERNAL = 500;

export interface MessagingLocals extends Record<string, unknown> {
  supabase: SupabaseClient;
}

export type MessagingResponse = Response<unknown, MessagingLocals>;

export function getSupabase(res: MessagingResponse): SupabaseClient {
  const { supabase }: MessagingLocals = res.locals;
  return supabase;
}

export function getRequiredParam(req: Request, name: string): string {
  const value: unknown = req.params[name];
  if (typeof value === 'string') return value;
  throw new Error(`Missing required param: ${name}`);
}

export function getOptionalQuery(req: Request, name: string): string | undefined {
  const value: unknown = req.query[name];
  if (typeof value === 'string') return value;
  return undefined;
}

export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}
