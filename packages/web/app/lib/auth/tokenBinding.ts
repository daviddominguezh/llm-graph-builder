import { createHash } from 'node:crypto';

const BINDING_BYTES = 16;

export function computeTokenBinding(accessToken: string): string {
  const digest = createHash('sha256').update(accessToken).digest();
  return digest.subarray(0, BINDING_BYTES).toString('base64url');
}
