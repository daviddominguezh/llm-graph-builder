import express from 'express';
import type { Request, Response } from 'express';

import { createServiceClient } from '../../../db/queries/executionAuthQueries.js';
import { processEchoMessage } from '../../controllers/echoProcessor.js';
import { processIncomingMessage } from '../../controllers/incomingProcessor.js';
import { captureRawBody, verifyWhatsAppSignature } from '../../middleware/webhookSignature.js';
import { getChannelConnectionByIdentifier } from '../../queries/channelQueries.js';
import type { ParsedEchoMessage, ParsedWhatsAppWebhook } from '../../services/whatsapp/webhookParser.js';
import { parseWhatsAppWebhook } from '../../services/whatsapp/webhookParser.js';
import type { IncomingMessage } from '../../types/index.js';

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

function readEnv(name: string): string {
  return process.env[name] ?? '';
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/* GET /whatsapp/webhook -- verification challenge */

function handleVerify(req: Request, res: Response): void {
  const mode = queryString(req.query['hub.mode']);
  const token = queryString(req.query['hub.verify_token']);
  const challenge = queryString(req.query['hub.challenge']);

  if (mode === 'subscribe' && token === readEnv('WHATSAPP_VERIFY_TOKEN')) {
    res.status(HTTP_OK).send(challenge ?? '');
    return;
  }

  res.status(HTTP_FORBIDDEN).send('Forbidden');
}

/* POST /whatsapp/webhook -- incoming messages */

async function processOneMessage(incoming: IncomingMessage): Promise<void> {
  const supabase = createServiceClient();
  const connection = await getChannelConnectionByIdentifier(supabase, incoming.channelIdentifier);
  if (connection === null) {
    process.stdout.write(`[whatsapp] No channel connection for ${incoming.channelIdentifier}\n`);
    return;
  }
  await processIncomingMessage({ supabase, connection, incoming });
}

async function processOneEcho(echo: ParsedEchoMessage): Promise<void> {
  const supabase = createServiceClient();
  const connection = await getChannelConnectionByIdentifier(supabase, echo.channelIdentifier);
  if (connection === null) {
    process.stdout.write(`[whatsapp] No channel connection for echo ${echo.channelIdentifier}\n`);
    return;
  }
  await processEchoMessage({ supabase, connection, echo });
}

async function processWebhookMessages(parsed: ParsedWhatsAppWebhook): Promise<void> {
  const messageTasks = parsed.messages.map(processOneMessage);
  const echoTasks = parsed.echoMessages.map(processOneEcho);
  await Promise.allSettled([...messageTasks, ...echoTasks]);
}

function handleIncoming(req: Request, res: Response): void {
  // Return 200 immediately to WhatsApp
  res.status(HTTP_OK).send('EVENT_RECEIVED');

  const parsed = parseWhatsAppWebhook(req.body);
  if (parsed === null) return;

  // Process async (don't await)
  processWebhookMessages(parsed).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stdout.write(`[whatsapp] Webhook processing error: ${msg}\n`);
  });
}

export const whatsappWebhookRouter = express.Router();
whatsappWebhookRouter.get('/webhook', handleVerify);
whatsappWebhookRouter.post(
  '/webhook',
  express.json({ verify: captureRawBody }),
  verifyWhatsAppSignature,
  handleIncoming
);
