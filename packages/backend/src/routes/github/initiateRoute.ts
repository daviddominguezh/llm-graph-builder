import type { Request } from 'express';
import { env } from 'node:process';
import { z } from 'zod';

import { signGitHubState } from '../../github/stateJwt.js';
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { extractErrorMessage, logGitHub, logGitHubError } from './githubHelpers.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_ERROR = 500;

const InitiateBodySchema = z.object({
  orgId: z.uuid(),
});

function getGitHubAppName(): string {
  const { GITHUB_APP_NAME } = env;
  if (GITHUB_APP_NAME === undefined || GITHUB_APP_NAME === '') {
    throw new Error('GITHUB_APP_NAME env var is required');
  }
  return GITHUB_APP_NAME;
}

function buildInstallUrl(appName: string, state: string): string {
  return `https://github.com/apps/${appName}/installations/new?state=${encodeURIComponent(state)}`;
}

/**
 * POST /github/initiate
 * Body: { orgId: string }
 * Auth: Bearer token (user session)
 * Returns: { authorizeUrl: string }
 */
export async function handleGitHubInitiate(req: Request, res: AuthenticatedResponse): Promise<void> {
  const parsed = InitiateBodySchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId (uuid) is required' });
    return;
  }

  const { userId }: AuthenticatedLocals = res.locals;

  try {
    const state = await signGitHubState({ orgId: parsed.data.orgId, userId });
    const appName = getGitHubAppName();
    const authorizeUrl = buildInstallUrl(appName, state);

    logGitHub('initiate', `org=${parsed.data.orgId} user=${userId}`);
    res.status(HTTP_OK).json({ authorizeUrl });
  } catch (err) {
    const message = extractErrorMessage(err);
    logGitHubError('initiate', message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
