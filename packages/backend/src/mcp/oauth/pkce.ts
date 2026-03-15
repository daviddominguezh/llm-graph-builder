import { createHash, randomBytes } from 'node:crypto';

const VERIFIER_LENGTH = 43;
const SLICE_START = 0;

export function generateCodeVerifier(): string {
  return randomBytes(VERIFIER_LENGTH).toString('base64url').slice(SLICE_START, VERIFIER_LENGTH);
}

export function computeCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
