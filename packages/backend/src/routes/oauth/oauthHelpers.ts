import { createClient } from '@supabase/supabase-js';
import type { Request, Response } from 'express';

import type { ClientRegistration } from '../../mcp/oauth/registration.js';
import { HTTP_BAD_REQUEST, HTTP_INTERNAL_ERROR } from '../routeHelpers.js';

type SupabaseClient = ReturnType<typeof createClient>;

interface McpLibraryRow {
  transport_type: string;
  transport_config: { url?: string } | null;
}

const MIN_LENGTH = 0;

function readEnv(name: string): string | undefined {
  return process.env[name];
}

export function createServiceClient(): SupabaseClient {
  const url = readEnv('SUPABASE_URL');
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (url === undefined || key === undefined || url === '' || key === '') {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

export function getRequiredEnv(name: string): string {
  const value = readEnv(name);
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export async function lookupMcpServerUrl(supabase: SupabaseClient, libraryItemId: string): Promise<string> {
  const result = await supabase
    .from('mcp_library')
    .select('transport_type, transport_config')
    .eq('id', libraryItemId)
    .single();

  if (result.error !== null) {
    throw new Error(`MCP library lookup failed: ${result.error.message}`);
  }

  const row: McpLibraryRow = result.data as McpLibraryRow;
  const url = row.transport_config?.url;

  if (typeof url !== 'string' || url.length === MIN_LENGTH) {
    throw new Error('MCP library item has no transport URL');
  }

  return url;
}

export function sendBadRequest(res: Response, message: string): void {
  res.status(HTTP_BAD_REQUEST).json({ error: message });
}

export function sendInternalError(res: Response, message: string): void {
  res.status(HTTP_INTERNAL_ERROR).json({ error: message });
}

export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function getStringParam(req: Request, name: string): string | undefined {
  const { query } = req;
  const { [name]: value } = query;
  if (typeof value === 'string' && value.length > MIN_LENGTH) return value;
  return undefined;
}

function isClientRegistration(value: unknown): value is ClientRegistration {
  return typeof value === 'object' && value !== null && 'client_id' in value;
}

export function parseClientRegistration(decrypted: string): ClientRegistration {
  const parsed: unknown = JSON.parse(decrypted);
  if (!isClientRegistration(parsed)) {
    throw new Error('Invalid client registration JSON');
  }
  return parsed;
}

export function logOAuthError(handler: string, message: string): void {
  process.stderr.write(`[oauth/${handler}] ERROR: ${message}\n`);
}

export function logOAuthInfo(handler: string, message: string): void {
  process.stdout.write(`[oauth/${handler}] ${message}\n`);
}
