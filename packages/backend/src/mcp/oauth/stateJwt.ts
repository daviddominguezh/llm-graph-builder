import { SignJWT, jwtVerify } from 'jose';

const STATE_EXPIRY = '5m';

export interface OAuthStatePayload {
  orgId: string;
  libraryItemId: string;
  userId: string;
  codeVerifier: string;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env['JWT_SECRET'];
  if (secret === undefined || secret.length === 0) {
    throw new Error('JWT_SECRET env var is required');
  }
  return new TextEncoder().encode(secret);
}

export async function signState(payload: OAuthStatePayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(STATE_EXPIRY)
    .setIssuedAt()
    .sign(getJwtSecret());
}

export async function verifyState(token: string): Promise<OAuthStatePayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return {
    orgId: payload['orgId'] as string,
    libraryItemId: payload['libraryItemId'] as string,
    userId: payload['userId'] as string,
    codeVerifier: payload['codeVerifier'] as string,
  };
}
