import { createHmac, timingSafeEqual } from 'node:crypto';

const MIN_SECRET_BYTES = 32;

export interface StatusPayload {
  uid: string;
  tokenBinding: string;
  phone_verified: boolean;
  onboarding_completed: boolean;
}

function canonicalize(obj: StatusPayload): string {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = (obj as unknown as Record<string, unknown>)[k];
  }
  return JSON.stringify(sorted);
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

function requireSecret(name: string): Buffer {
  const v = process.env[name];
  if (v === undefined || Buffer.from(v).length < MIN_SECRET_BYTES) {
    throw new Error(`${name} missing or < ${MIN_SECRET_BYTES.toString()} bytes`);
  }
  return Buffer.from(v);
}

export function signStatusCookie(payload: StatusPayload): string {
  const secret = requireSecret('AUTH_STATUS_COOKIE_SECRET');
  const payloadBytes = Buffer.from(canonicalize(payload));
  const mac = createHmac('sha256', secret).update(payloadBytes).digest();
  return `${b64url(payloadBytes)}.${b64url(mac)}`;
}

function verifyWithSecret(payloadBytes: Buffer, macGiven: Buffer, secret: Buffer): boolean {
  const macExpected = createHmac('sha256', secret).update(payloadBytes).digest();
  if (macExpected.length !== macGiven.length) return false;
  return timingSafeEqual(macExpected, macGiven);
}

function parsePayload(payloadBytes: Buffer): StatusPayload | null {
  try {
    const parsed = JSON.parse(payloadBytes.toString('utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    const valid =
      typeof p.uid === 'string' &&
      typeof p.tokenBinding === 'string' &&
      typeof p.phone_verified === 'boolean' &&
      typeof p.onboarding_completed === 'boolean';
    if (!valid) return null;
    return p as unknown as StatusPayload;
  } catch {
    return null;
  }
}

function checkPreviousSecret(payloadBytes: Buffer, macGiven: Buffer): boolean {
  const prev = process.env.AUTH_STATUS_COOKIE_SECRET_PREVIOUS;
  if (prev === undefined) return false;
  const prevBuf = Buffer.from(prev);
  if (prevBuf.length < MIN_SECRET_BYTES) return false;
  return verifyWithSecret(payloadBytes, macGiven, prevBuf);
}

export function verifyStatusCookie(cookie: string): StatusPayload | null {
  const dot = cookie.indexOf('.');
  if (dot < 0 || dot === cookie.length - 1) return null;
  const payloadBytes = b64urlDecode(cookie.slice(0, dot));
  const macGiven = b64urlDecode(cookie.slice(dot + 1));
  const current = requireSecret('AUTH_STATUS_COOKIE_SECRET');
  const ok = verifyWithSecret(payloadBytes, macGiven, current) || checkPreviousSecret(payloadBytes, macGiven);
  if (!ok) return null;
  return parsePayload(payloadBytes);
}
