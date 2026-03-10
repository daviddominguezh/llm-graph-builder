import type { createClient } from '@supabase/supabase-js';
import type { Request, Response } from 'express';

type SupabaseClient = ReturnType<typeof createClient>;

export const HTTP_OK = 200;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_NOT_FOUND = 404;
export const HTTP_INTERNAL_ERROR = 500;

export interface AuthenticatedLocals extends Record<string, unknown> {
  supabase: SupabaseClient;
  userId: string;
}

export type AuthenticatedResponse = Response<unknown, AuthenticatedLocals>;

interface AgentParams {
  agentId?: string | string[];
}

export function getAgentId(req: Request): string | undefined {
  const { agentId }: AgentParams = req.params;
  if (typeof agentId === 'string') return agentId;
  return undefined;
}

export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}
