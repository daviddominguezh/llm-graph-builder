import { SignJWT, importPKCS8 } from 'jose';
import { env } from 'node:process';

import type { GitHubAppConfig } from './types.js';

const JWT_EXPIRY_SECONDS = 600;
const CLOCK_DRIFT_SECONDS = 60;
const MS_PER_SECOND = 1000;
const ALG = 'RS256';
const ESCAPED_NEWLINE_PATTERN = /\\n/gv;

function getConfigFromEnv(): GitHubAppConfig {
  const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_WEBHOOK_SECRET } = env;

  if (
    GITHUB_APP_ID === undefined ||
    GITHUB_APP_PRIVATE_KEY === undefined ||
    GITHUB_APP_WEBHOOK_SECRET === undefined
  ) {
    throw new Error('Missing GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, or GITHUB_APP_WEBHOOK_SECRET');
  }

  return {
    appId: GITHUB_APP_ID,
    privateKey: GITHUB_APP_PRIVATE_KEY,
    webhookSecret: GITHUB_APP_WEBHOOK_SECRET,
  };
}

/**
 * Normalizes the PEM key by converting literal \n sequences to actual newlines.
 * Environment variables often store PEM keys with escaped newlines.
 */
function normalizePem(pem: string): string {
  return pem.replace(ESCAPED_NEWLINE_PATTERN, '\n');
}

/**
 * Generates a short-lived JWT signed with the GitHub App's private key.
 * Used to authenticate as the App itself (not as an installation).
 *
 * @see https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-jwt-for-a-github-app
 */
export async function generateAppJwt(): Promise<string> {
  const config = getConfigFromEnv();
  const normalizedKey = normalizePem(config.privateKey);
  const privateKey = await importPKCS8(normalizedKey, ALG);
  const nowSeconds = Math.floor(Date.now() / MS_PER_SECOND);

  return await new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setIssuer(config.appId)
    .setIssuedAt(nowSeconds - CLOCK_DRIFT_SECONDS)
    .setExpirationTime(nowSeconds + JWT_EXPIRY_SECONDS)
    .sign(privateKey);
}

export { getConfigFromEnv };
