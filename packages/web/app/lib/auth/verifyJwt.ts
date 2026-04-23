import { jwtVerify } from 'jose';

interface VerifiedClaims {
  sub: string;
  exp: number;
}

let cachedSecret: Uint8Array | null = null;

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

export async function verifyAccessToken(accessToken: string): Promise<VerifiedClaims | null> {
  const secret = getSecret();
  if (secret === null) return null;
  try {
    const { payload } = await jwtVerify(accessToken, secret, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    return { sub: payload.sub, exp: payload.exp };
  } catch {
    return null;
  }
}
