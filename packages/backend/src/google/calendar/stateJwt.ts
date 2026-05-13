import { SignJWT, jwtVerify } from 'jose';
import { env } from 'node:process';
import { z } from 'zod';

const STATE_EXPIRY = '5m';
const EMPTY_LENGTH = 0;

export interface GoogleOAuthStatePayload {
  orgId: string;
  userId: string;
  codeVerifier: string;
}

const GoogleOAuthStatePayloadSchema = z.object({
  orgId: z.string(),
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

export async function signGoogleState(payload: GoogleOAuthStatePayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(STATE_EXPIRY)
    .setIssuedAt()
    .sign(getJwtSecret());
}

export async function verifyGoogleState(token: string): Promise<GoogleOAuthStatePayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return GoogleOAuthStatePayloadSchema.parse(payload);
}
