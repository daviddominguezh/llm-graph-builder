import { beforeEach, describe, expect, it } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { env } from 'node:process';

const TEST_SECRET = 'test-webhook-secret';

function computeSignature(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload, 'utf-8');
  return `sha256=${hmac.digest('hex')}`;
}

beforeEach(() => {
  env.GITHUB_APP_WEBHOOK_SECRET = TEST_SECRET;
});

describe('verifyWebhookSignature', () => {
  it('returns true for a valid signature', async () => {
    const { verifyWebhookSignature } = await import('../webhookVerify.js');
    const payload = '{"action":"created"}';
    const signature = computeSignature(payload, TEST_SECRET);

    expect(verifyWebhookSignature(payload, signature)).toBe(true);
  });

  it('returns false for an invalid signature', async () => {
    const { verifyWebhookSignature } = await import('../webhookVerify.js');
    const payload = '{"action":"created"}';

    expect(verifyWebhookSignature(payload, 'sha256=invalid')).toBe(false);
  });

  it('returns false when signature length does not match', async () => {
    const { verifyWebhookSignature } = await import('../webhookVerify.js');
    const payload = '{"action":"created"}';

    expect(verifyWebhookSignature(payload, 'sha256=short')).toBe(false);
  });

  it('returns false for a tampered payload', async () => {
    const { verifyWebhookSignature } = await import('../webhookVerify.js');
    const originalPayload = '{"action":"created"}';
    const signature = computeSignature(originalPayload, TEST_SECRET);
    const tamperedPayload = '{"action":"deleted"}';

    expect(verifyWebhookSignature(tamperedPayload, signature)).toBe(false);
  });
});
