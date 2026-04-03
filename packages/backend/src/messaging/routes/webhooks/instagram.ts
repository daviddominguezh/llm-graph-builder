import express from 'express';
import type { Request, Response } from 'express';

import { createServiceClient } from '../../../db/queries/executionAuthQueries.js';
import { processIncomingMessage } from '../../controllers/incomingProcessor.js';
import { captureRawBody, verifyInstagramSignature } from '../../middleware/webhookSignature.js';
import { getChannelConnectionByIdentifier } from '../../queries/channelQueries.js';
import type { IncomingMessage } from '../../types/index.js';
import { parseInstagramWebhook } from '../../services/instagram/webhookParser.js';

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

function readEnv(name: string): string {
  return process.env[name] ?? '';
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/* GET /instagram/webhook -- verification challenge */

function handleVerify(req: Request, res: Response): void {
  const mode = queryString(req.query['hub.mode']);
  const token = queryString(req.query['hub.verify_token']);
  const challenge = queryString(req.query['hub.challenge']);

  if (mode === 'subscribe' && token === readEnv('INSTAGRAM_VERIFY_TOKEN')) {
    res.status(HTTP_OK).send(challenge ?? '');
    return;
  }

  res.status(HTTP_FORBIDDEN).send('Forbidden');
}

/* POST /instagram/webhook -- incoming messages */

async function processOneMessage(incoming: IncomingMessage): Promise<void> {
  const supabase = createServiceClient();
  const connection = await getChannelConnectionByIdentifier(supabase, incoming.channelIdentifier);
  if (connection === null) {
    process.stdout.write(`[instagram] No channel connection for ${incoming.channelIdentifier}\n`);
    return;
  }
  await processIncomingMessage({ supabase, connection, incoming });
}

async function processWebhookMessages(messages: IncomingMessage[]): Promise<void> {
  const tasks = messages.map(processOneMessage);
  await Promise.allSettled(tasks);
}

function handleIncoming(req: Request, res: Response): void {
  // Return 200 immediately to Instagram
  res.status(HTTP_OK).send('EVENT_RECEIVED');

  const parsed = parseInstagramWebhook(req.body);
  if (parsed === null) return;

  // Process async (don't await)
  processWebhookMessages(parsed.messages).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stdout.write(`[instagram] Webhook processing error: ${msg}\n`);
  });
}

export const instagramWebhookRouter = express.Router();
instagramWebhookRouter.get('/webhook', handleVerify);
instagramWebhookRouter.post(
  '/webhook',
  express.json({ verify: captureRawBody }),
  verifyInstagramSignature,
  handleIncoming
);
