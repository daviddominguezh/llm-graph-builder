import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Verify HMAC-SHA256 signature from WhatsApp/Instagram webhooks.
 * The raw body must be available on req.body as a Buffer.
 */
export function verifyWebhookSignature(appSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (signature === undefined) {
      res.status(401).json({ error: 'Missing signature header' });
      return;
    }

    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const expectedSignature = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    next();
  };
}
