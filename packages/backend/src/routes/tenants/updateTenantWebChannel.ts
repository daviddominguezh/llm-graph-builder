import { parseAllowedOriginEntry } from '@openflow/shared-validation';
import type { Request } from 'express';

import { updateTenantWebChannel } from '../../db/queries/tenantQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getTenantIdParam } from './tenantHelpers.js';

interface ParsedBody {
  enabled: boolean;
  allowedOrigins: string[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseBody(raw: unknown): ParsedBody | null {
  if (!isRecord(raw)) return null;
  const { enabled, allowedOrigins } = raw;
  if (typeof enabled !== 'boolean') return null;
  if (!isStringArray(allowedOrigins)) return null;
  for (const entry of allowedOrigins) {
    if (parseAllowedOriginEntry(entry) === null) return null;
  }
  return { enabled, allowedOrigins };
}

export async function handleUpdateTenantWebChannel(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const tenantId = getTenantIdParam(req);
  if (tenantId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Tenant ID is required' });
    return;
  }
  const parsed = parseBody(req.body);
  if (parsed === null) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid body' });
    return;
  }
  try {
    const { result, error } = await updateTenantWebChannel(supabase, tenantId, {
      enabled: parsed.enabled,
      allowedOrigins: parsed.allowedOrigins,
    });
    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to update web channel' });
      return;
    }
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
