import { generateAppJwt } from './appJwt.js';
import { createInstallationAccessToken, fetchInstallation } from './githubApi.js';
import type { GitHubAccessTokenResponse, GitHubInstallationResponse } from './types.js';

/**
 * Mint a fresh installation access token for the given installation ID.
 * Steps: generate App JWT -> exchange for installation token.
 * No token is persisted — a fresh one is minted on every call.
 */
export async function mintInstallationToken(installationId: number): Promise<GitHubAccessTokenResponse> {
  const appJwt = await generateAppJwt();
  return await createInstallationAccessToken(appJwt, installationId);
}

/**
 * Fetch and validate an installation using an App JWT.
 */
export async function getInstallationDetails(installationId: number): Promise<GitHubInstallationResponse> {
  const appJwt = await generateAppJwt();
  return await fetchInstallation(appJwt, installationId);
}
