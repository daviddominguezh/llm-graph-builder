import { SignJWT, jwtVerify } from 'jose';
import { env } from 'node:process';
import { z } from 'zod';

const STATE_EXPIRY = '5m';
const EMPTY_LENGTH = 0;

export interface OAuthStatePayload {
  orgId: string;
  libraryItemId: string;
  userId: string;
  codeVerifier: string;
}

const OAuthStatePayloadSchema = z.object({
  orgId: z.string(),
  libraryItemId: z.string(),
  userId: z.string(),
  codeVerifier: z.string(),
});

function getJwtSecret(): Uint8Array {
  const { JWT_SECRET } = env;
  if (JWT_SECRET === undefined || JWT_SECRET.length === EMPTY_LENGTH) {
    throw new Error('JWT_SECRET env var is required');
  }
  return new TextEncoder().encode(JWT_SECRET);
}

export async function signState(payload: OAuthStatePayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(STATE_EXPIRY)
    .setIssuedAt()
    .sign(getJwtSecret());
}

export async function verifyState(token: string): Promise<OAuthStatePayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return OAuthStatePayloadSchema.parse(payload);
}
