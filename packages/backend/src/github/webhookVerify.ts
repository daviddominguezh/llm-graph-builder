import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from 'node:process';

const SIGNATURE_PREFIX = 'sha256=';
const HEX_ENCODING = 'hex';

function getWebhookSecret(): string {
  const { GITHUB_APP_WEBHOOK_SECRET } = env;
  if (GITHUB_APP_WEBHOOK_SECRET === undefined || GITHUB_APP_WEBHOOK_SECRET === '') {
    throw new Error('GITHUB_APP_WEBHOOK_SECRET is required');
  }
  return GITHUB_APP_WEBHOOK_SECRET;
}

function computeExpectedSignature(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload, 'utf-8');
  return `${SIGNATURE_PREFIX}${hmac.digest(HEX_ENCODING)}`;
}

/**
 * Verify the HMAC-SHA256 signature on a GitHub webhook payload.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param payload - The raw request body as a string
 * @param signature - The value of the x-hub-signature-256 header
 * @returns true if the signature is valid
 */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = getWebhookSecret();
  const expected = computeExpectedSignature(payload, secret);

  if (expected.length !== signature.length) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
