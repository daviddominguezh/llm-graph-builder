import { SignJWT, jwtVerify } from 'jose';
import { env } from 'node:process';
import { z } from 'zod';

const STATE_EXPIRY = '10m';
const EMPTY_LENGTH = 0;

export interface GitHubOAuthStatePayload {
  orgId: string;
  userId: string;
}

const GitHubOAuthStateSchema = z.object({
  orgId: z.string(),
  userId: z.string(),
});

function getJwtSecret(): Uint8Array {
  const { JWT_SECRET } = env;
  if (JWT_SECRET === undefined || JWT_SECRET.length === EMPTY_LENGTH) {
    throw new Error('JWT_SECRET env var is required');
  }
  return new TextEncoder().encode(JWT_SECRET);
}

export async function signGitHubState(payload: GitHubOAuthStatePayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(STATE_EXPIRY)
    .setIssuedAt()
    .sign(getJwtSecret());
}

export async function verifyGitHubState(token: string): Promise<GitHubOAuthStatePayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return GitHubOAuthStateSchema.parse(payload);
}
