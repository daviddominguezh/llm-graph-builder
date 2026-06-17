import type { Request } from 'express';

import { createExecutionKey } from '../../db/queries/executionKeyMutations.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import {
  parseBooleanField,
  parseNullableStringField,
  parseStringArrayField,
  parseStringField,
} from './secretsHelpers.js';

const EMPTY_LENGTH = 0;

interface ParsedInput {
  orgId: string;
  name: string;
  allAgents: boolean;
  agentIds: string[];
  allTenants: boolean;
  tenantIds: string[];
  expiresAt: string | null;
}

interface ScopeFields {
  allAgents: boolean;
  agentIds: string[];
  allTenants: boolean;
  tenantIds: string[];
}

function parseScopeFields(body: unknown): ScopeFields {
  return {
    allAgents: parseBooleanField(body, 'allAgents') ?? false,
    agentIds: parseStringArrayField(body, 'agentIds') ?? [],
    allTenants: parseBooleanField(body, 'allTenants') ?? true,
    tenantIds: parseStringArrayField(body, 'tenantIds') ?? [],
  };
}

function isScopeValid(scope: ScopeFields): boolean {
  if (!scope.allAgents && scope.agentIds.length === EMPTY_LENGTH) return false;
  if (!scope.allTenants && scope.tenantIds.length === EMPTY_LENGTH) return false;
  return true;
}

function parseCreateInput(body: unknown): ParsedInput | null {
  const orgId = parseStringField(body, 'orgId');
  const name = parseStringField(body, 'name');
  if (orgId === undefined || name === undefined) return null;

  const scope = parseScopeFields(body);
  if (!isScopeValid(scope)) return null;

  const expiresAt = parseNullableStringField(body, 'expiresAt') ?? null;
  return { orgId, name, ...scope, expiresAt };
}

export async function handleCreateExecutionKey(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const input = parseCreateInput(req.body);

  if (input === null) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId, name, and agentIds (or allAgents) are required' });
    return;
  }

  try {
    const { result, error } = await createExecutionKey(supabase, input);

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create execution key' });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
