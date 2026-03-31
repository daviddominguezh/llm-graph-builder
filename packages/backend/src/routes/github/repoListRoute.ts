import type { Request } from 'express';

import { fetchInstallationRepos } from '../../github/githubApi.js';
import { mintInstallationToken } from '../../github/installationToken.js';
import type { AuthenticatedResponse } from '../routeHelpers.js';
import { extractErrorMessage, logGitHub, logGitHubError } from './githubHelpers.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_ERROR = 500;
const MIN_INSTALLATION_ID = 0;

function getInstallationIdParam(req: Request): string | undefined {
  const { installationId }: { installationId?: string | string[] } = req.params;
  if (typeof installationId === 'string') return installationId;
  return undefined;
}

function parseInstallationId(param: string | undefined): number | null {
  if (param === undefined) return null;
  const parsed = Number(param);
  if (!Number.isInteger(parsed) || parsed <= MIN_INSTALLATION_ID) return null;
  return parsed;
}

/**
 * GET /github/installations/:installationId/repos
 * Auth: Bearer token (user session)
 */
export async function handleListRepos(req: Request, res: AuthenticatedResponse): Promise<void> {
  const installationId = parseInstallationId(getInstallationIdParam(req));

  if (installationId === null) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid installation ID' });
    return;
  }

  try {
    logGitHub('repos', `listing for installation=${String(installationId)}`);
    const tokenResponse = await mintInstallationToken(installationId);
    const repoList = await fetchInstallationRepos(tokenResponse.token);
    res.status(HTTP_OK).json(repoList);
  } catch (err) {
    const message = extractErrorMessage(err);
    logGitHubError('repos', message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
