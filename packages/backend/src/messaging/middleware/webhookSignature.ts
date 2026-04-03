import type { NextFunction, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

/* ─── Module augmentation for rawBody on Request ─── */

declare module 'express' {
  interface Request {
    rawBody?: Buffer;
  }
}

const HTTP_FORBIDDEN = 403;

function readEnv(name: string): string {
  return process.env[name] ?? '';
}

/**
 * Middleware that captures the raw request body as a Buffer for HMAC verification.
 * Use as the `verify` callback in `express.json()`.
 *
 * Usage:
 *   express.json({ verify: captureRawBody })
 */
function setRequestProperty(target: Record<string, unknown>, values: Record<string, unknown>): void {
  Object.assign(target, values);
}

export function captureRawBody(req: Request, _res: Response, buf: Buffer): void {
  setRequestProperty(req, { rawBody: buf });
}

/**
 * Verify HMAC-SHA256 signature from WhatsApp/Instagram webhooks.
 * Requires `captureRawBody` to have been called via express.json({ verify }).
 */
export function verifyWebhookSignature(appSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signatureHeader: unknown = req.headers['x-hub-signature-256'];
    const signature = typeof signatureHeader === 'string' ? signatureHeader : undefined;

    if (signature === undefined) {
      res.status(HTTP_FORBIDDEN).json({ error: 'Missing signature header' });
      return;
    }

    const { rawBody } = req;
    if (rawBody === undefined) {
      res.status(HTTP_FORBIDDEN).json({ error: 'Missing raw body for HMAC verification' });
      return;
    }

    const expectedSignature = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      res.status(HTTP_FORBIDDEN).json({ error: 'Invalid signature' });
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
