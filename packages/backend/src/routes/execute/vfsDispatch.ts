import type { SupabaseClient } from '@supabase/supabase-js';

import { getVfsConfigForDispatch } from '../../db/queries/vfsConfigQueries.js';
import type { AgentVfsSettings } from '../../db/queries/vfsConfigTypes.js';
import { mintInstallationToken } from '../../github/installationToken.js';
import { HttpError } from './executeFetcher.js';
import { fetchAgentSlug, fetchOrgSlug, resolveCommitSha, splitRepoFullName } from './vfsDispatchHelpers.js';

const HTTP_UNPROCESSABLE = 422;
const HTTP_BAD_GATEWAY = 502;

/* ------------------------------------------------------------------ */
/*  VFS payload type                                                   */
/* ------------------------------------------------------------------ */

export interface VfsPayload {
  token: string;
  owner: string;
  repo: string;
  commitSha: string;
  tenantSlug: string;
  agentSlug: string;
  userJwt: string;
  settings: Omit<AgentVfsSettings, 'enabled'>;
}

/* ------------------------------------------------------------------ */
/*  Build params                                                       */
/* ------------------------------------------------------------------ */

export interface VfsDispatchParams {
  agentId: string;
  orgId: string;
  vfsSettings: AgentVfsSettings;
  userJwt: string;
  ref?: string;
}

/* ------------------------------------------------------------------ */
/*  Settings extraction (strip 'enabled')                              */
/* ------------------------------------------------------------------ */

function extractRuntimeSettings(settings: AgentVfsSettings): Omit<AgentVfsSettings, 'enabled'> {
  const { protectedPaths, searchCandidateLimit, readLineCeiling, rateLimitThreshold } = settings;
  return { protectedPaths, searchCandidateLimit, readLineCeiling, rateLimitThreshold };
}

/* ------------------------------------------------------------------ */
/*  Main dispatch builder                                              */
/* ------------------------------------------------------------------ */

export async function buildVfsPayload(
  supabase: SupabaseClient,
  params: VfsDispatchParams
): Promise<VfsPayload> {
  // Step 1: Look up VFS config (joined query validates repo exists)
  const config = await getVfsConfigForDispatch(supabase, params.agentId, params.orgId);
  if (config === null) {
    throw new HttpError(HTTP_UNPROCESSABLE, 'No VFS repo configured for this tenant');
  }

  // Step 2: Check installation status
  if (config.installation_status === 'suspended') {
    throw new HttpError(HTTP_UNPROCESSABLE, 'GitHub installation is suspended');
  }
  if (config.installation_status !== 'active') {
    throw new HttpError(HTTP_UNPROCESSABLE, 'GitHub installation was revoked');
  }
  if (!config.repo_exists) {
    throw new HttpError(HTTP_UNPROCESSABLE, 'Repository no longer accessible');
  }

  // Steps 3-6 in parallel
  const { owner, repo } = splitRepoFullName(config.repo_full_name);
  return await assemblePayload(supabase, params, { installationId: config.installation_id, owner, repo });
}

interface AssembleContext {
  installationId: number;
  owner: string;
  repo: string;
}

async function assemblePayload(
  supabase: SupabaseClient,
  params: VfsDispatchParams,
  ctx: AssembleContext
): Promise<VfsPayload> {
  try {
    const [tokenResponse, tenantSlug, agentSlug] = await Promise.all([
      mintInstallationToken(ctx.installationId),
      fetchOrgSlug(supabase, params.orgId),
      fetchAgentSlug(supabase, params.agentId),
    ]);

    const commitSha = await resolveCommitSha(tokenResponse.token, ctx.owner, ctx.repo, params.ref);

    return {
      token: tokenResponse.token,
      owner: ctx.owner,
      repo: ctx.repo,
      commitSha,
      tenantSlug,
      agentSlug,
      userJwt: params.userJwt,
      settings: extractRuntimeSettings(params.vfsSettings),
    };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const msg = err instanceof Error ? err.message : 'VFS dispatch failed';
    throw new HttpError(HTTP_BAD_GATEWAY, msg);
  }
}
