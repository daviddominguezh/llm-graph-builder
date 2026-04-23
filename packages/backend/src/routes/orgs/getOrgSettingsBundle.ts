import type { Request } from 'express';

import type { ApiKeyRow } from '../../db/queries/apiKeyQueries.js';
import { getApiKeysByOrg } from '../../db/queries/apiKeyQueries.js';
import type { OrgEnvVariableRow } from '../../db/queries/envVariableQueries.js';
import { getEnvVariablesByOrg } from '../../db/queries/envVariableQueries.js';
import { getOrgBySlug, getUserRoleInOrg } from '../../db/queries/orgQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getSlugParam } from './orgHelpers.js';

interface SettingsBundleParts {
  role: string | null;
  apiKeys: ApiKeyRow[];
  envVariables: OrgEnvVariableRow[];
}

async function loadBundle(
  supabase: AuthenticatedLocals['supabase'],
  userId: string,
  orgId: string
): Promise<SettingsBundleParts> {
  const [role, apiKeysResult, envVarsResult] = await Promise.all([
    getUserRoleInOrg(supabase, orgId, userId),
    getApiKeysByOrg(supabase, orgId),
    getEnvVariablesByOrg(supabase, orgId),
  ]);
  return {
    role,
    apiKeys: apiKeysResult.result,
    envVariables: envVarsResult.result,
  };
}

export async function handleGetOrgSettingsBundle(
  req: Request,
  res: AuthenticatedResponse
): Promise<void> {
  const { supabase, userId }: AuthenticatedLocals = res.locals;
  const slug = getSlugParam(req);
  if (slug === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Slug is required' });
    return;
  }
  try {
    const { result: org, error } = await getOrgBySlug(supabase, slug);
    if (error !== null || org === null) {
      res.status(HTTP_NOT_FOUND).json({ error: error ?? 'Organization not found' });
      return;
    }
    const bundle = await loadBundle(supabase, userId, org.id);
    res.status(HTTP_OK).json({ org, ...bundle });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
