import type { NextFunction, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

const HTTP_UNAUTHORIZED = 401;

function readEnv(name: string): string {
  return process.env[name] ?? '';
}

/**
 * Verify HMAC-SHA256 signature from WhatsApp/Instagram webhooks.
 * The raw body must be available on req.body as a string (use express.text()).
 */
export function verifyWebhookSignature(appSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signatureHeader: unknown = req.headers['x-hub-signature-256'];
    const signature = typeof signatureHeader === 'string' ? signatureHeader : undefined;

    if (signature === undefined) {
      res.status(HTTP_UNAUTHORIZED).json({ error: 'Missing signature header' });
      return;
    }

    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const expectedSignature = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      res.status(HTTP_UNAUTHORIZED).json({ error: 'Invalid signature' });
      return;
    }

    next();
  };
}

/* ─── Named middleware for WhatsApp and Instagram ─── */

export function verifyWhatsAppSignature(req: Request, res: Response, next: NextFunction): void {
  const secret = readEnv('WHATSAPP_APP_SECRET');
  verifyWebhookSignature(secret)(req, res, next);
}

export function verifyInstagramSignature(req: Request, res: Response, next: NextFunction): void {
  const secret = readEnv('INSTAGRAM_APP_SECRET');
  verifyWebhookSignature(secret)(req, res, next);
}
