import { createRemoteJWKSet, jwtVerify } from 'jose';

interface VerifiedClaims {
  sub: string;
  exp: number;
}

type JwksResolver = ReturnType<typeof createRemoteJWKSet>;

let cachedSecret: Uint8Array | null = null;
let cachedJwks: JwksResolver | null = null;

function readEnv(name: string): string | null {
  return process.env[name] ?? null;
}

function getSecret(): Uint8Array | null {
  if (cachedSecret !== null) return cachedSecret;
  const secret = readEnv('SUPABASE_JWT_SECRET');
  if (secret === null || secret === '') return null;
  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

function getJwks(): JwksResolver | null {
  if (cachedJwks !== null) return cachedJwks;
  const url = readEnv('NEXT_PUBLIC_SUPABASE_URL');
  if (url === null || url === '') return null;
  cachedJwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  return cachedJwks;
}

function toClaims(payload: Record<string, unknown>): VerifiedClaims | null {
  const { sub, exp } = payload;
  if (typeof sub !== 'string' || typeof exp !== 'number') return null;
  return { sub, exp };
}

async function verifyWithSecret(token: string, secret: Uint8Array): Promise<VerifiedClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return toClaims(payload);
  } catch {
    return null;
  }
}

async function verifyWithJwks(token: string, jwks: JwksResolver): Promise<VerifiedClaims | null> {
  try {
    const { payload } = await jwtVerify(token, jwks);
    return toClaims(payload);
  } catch {
    return null;
  }
}

export async function verifyAccessToken(accessToken: string): Promise<VerifiedClaims | null> {
  const secret = getSecret();
  if (secret !== null) {
    const claims = await verifyWithSecret(accessToken, secret);
    if (claims !== null) return claims;
  }
  const jwks = getJwks();
  if (jwks !== null) {
    const claims = await verifyWithJwks(accessToken, jwks);
    if (claims !== null) return claims;
  }
  return null;
}
