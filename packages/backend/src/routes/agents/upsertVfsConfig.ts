import type { Request } from 'express';
import { z } from 'zod';

import { upsertVfsConfig } from '../../db/queries/vfsConfigQueries.js';
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { HTTP_INTERNAL_ERROR, extractErrorMessage, getAgentId } from '../routeHelpers.js';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNPROCESSABLE = 422;
const MIN_STR_LENGTH = 1;

const UpsertBodySchema = z.object({
  installationId: z.number().int().positive(),
  repoId: z.number().int().positive(),
  repoFullName: z.string().min(MIN_STR_LENGTH),
});

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                 */
/* ------------------------------------------------------------------ */

interface OrgParam {
  orgId?: string | string[];
}

function getOrgIdParam(req: Request): string | undefined {
  const { orgId }: OrgParam = req.params;
  return typeof orgId === 'string' ? orgId : undefined;
}

interface InstallationCheckRow {
  installation_id: number;
}

async function validateInstallation(
  locals: AuthenticatedLocals,
  installationId: number,
  orgId: string
): Promise<string | null> {
  const { data } = await locals.supabase
    .from('github_installations')
    .select('installation_id')
    .eq('installation_id', installationId)
    .eq('org_id', orgId)
    .single();

  const row = data as InstallationCheckRow | null;
  if (row === null) return 'Installation not found for this organization';
  return null;
}

async function validateRepo(
  locals: AuthenticatedLocals,
  installationId: number,
  repoId: number
): Promise<string | null> {
  const { data } = await locals.supabase
    .from('github_installation_repos')
    .select('installation_id')
    .eq('installation_id', installationId)
    .eq('repo_id', repoId)
    .single();

  const row = data as InstallationCheckRow | null;
  if (row === null) return 'Repository not found in installation';
  return null;
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export async function handleUpsertVfsConfig(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  const orgId = getOrgIdParam(req);

  if (agentId === undefined || orgId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID and org ID are required' });
    return;
  }

  const parsed = UpsertBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.message });
    return;
  }

  const locals: AuthenticatedLocals = res.locals;

  try {
    const installErr = await validateInstallation(locals, parsed.data.installationId, orgId);
    if (installErr !== null) {
      res.status(HTTP_UNPROCESSABLE).json({ error: installErr });
      return;
    }

    const repoErr = await validateRepo(locals, parsed.data.installationId, parsed.data.repoId);
    if (repoErr !== null) {
      res.status(HTTP_UNPROCESSABLE).json({ error: repoErr });
      return;
    }

    const row = await upsertVfsConfig(locals.supabase, {
      agentId,
      orgId,
      installationId: parsed.data.installationId,
      repoId: parsed.data.repoId,
      repoFullName: parsed.data.repoFullName,
    });
    res.json(row);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
