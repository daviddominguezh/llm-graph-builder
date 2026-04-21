import type { Request } from 'express';
import { z } from 'zod';

import { upsertInstallation } from '../../db/queries/githubInstallationQueries.js';
import { syncRepos } from '../../db/queries/githubRepoQueries.js';
import { fetchInstallationRepos } from '../../github/githubApi.js';
import { getInstallationDetails, mintInstallationToken } from '../../github/installationToken.js';
import { verifyGitHubState } from '../../github/stateJwt.js';
import type { AuthenticatedResponse } from '../routeHelpers.js';
import { createServiceClient, extractErrorMessage, logGitHub, logGitHubError } from './githubHelpers.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_ERROR = 500;

const InstallationBodySchema = z.object({
  installationId: z.number().int().positive(),
  orgId: z.uuid(),
  state: z.string(),
});

type InstallationBody = z.infer<typeof InstallationBodySchema>;

function parseBody(body: unknown): InstallationBody | null {
  const result = InstallationBodySchema.safeParse(body);
  return result.success ? result.data : null;
}

async function storeInstallationAndRepos(installationId: number, orgId: string): Promise<void> {
  const supabase = createServiceClient();
  const installation = await getInstallationDetails(installationId);

  await upsertInstallation(supabase, {
    installationId: installation.id,
    orgId,
    accountName: installation.account.login,
    accountType: installation.account.type,
  });

  const tokenResponse = await mintInstallationToken(installationId);
  const repoList = await fetchInstallationRepos(tokenResponse.token);
  await syncRepos(supabase, installationId, repoList.repositories);
}

async function validateState(state: string, orgId: string): Promise<string | null> {
  try {
    const statePayload = await verifyGitHubState(state);
    if (statePayload.orgId !== orgId) {
      return 'State orgId mismatch';
    }
    return null;
  } catch {
    return 'Invalid or expired state token';
  }
}

/**
 * POST /github/installations
 * Body: { installationId: number, orgId: string, state: string }
 * Auth: Bearer token (user session)
 */
export async function handleCreateInstallation(req: Request, res: AuthenticatedResponse): Promise<void> {
  const parsed = parseBody(req.body);

  if (parsed === null) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'installationId (number), orgId (uuid), and state required' });
    return;
  }

  const stateError = await validateState(parsed.state, parsed.orgId);
  if (stateError !== null) {
    res.status(HTTP_BAD_REQUEST).json({ error: stateError });
    return;
  }

  try {
    logGitHub('installation', `creating id=${String(parsed.installationId)} org=${parsed.orgId}`);
    await storeInstallationAndRepos(parsed.installationId, parsed.orgId);
    logGitHub('installation', `created id=${String(parsed.installationId)}`);
    res.status(HTTP_OK).json({ ok: true });
  } catch (err) {
    const message = extractErrorMessage(err);
    logGitHubError('installation', message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
