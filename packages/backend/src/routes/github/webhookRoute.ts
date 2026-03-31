import type { Request, Response } from 'express';

import type { WebhookInstallationPayload, WebhookInstallationReposPayload } from '../../github/types.js';
import { verifyWebhookSignature } from '../../github/webhookVerify.js';
import { createServiceClient, extractErrorMessage, logGitHub, logGitHubError } from './githubHelpers.js';
import {
  handleInstallationCreated,
  handleInstallationDeleted,
  handleInstallationSuspend,
  handleInstallationUnsuspend,
  handleReposAdded,
  handleReposRemoved,
} from './webhookHandlers.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_INTERNAL_ERROR = 500;

/* ------------------------------------------------------------------ */
/*  Header extraction                                                  */
/* ------------------------------------------------------------------ */

function getSignatureHeader(req: Request): string | undefined {
  return req.get('x-hub-signature-256');
}

function getEventHeader(req: Request): string | undefined {
  return req.get('x-github-event');
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInstallationPayload(value: unknown): value is WebhookInstallationPayload {
  return isRecord(value) && 'action' in value && 'installation' in value;
}

function isReposPayload(value: unknown): value is WebhookInstallationReposPayload {
  return isRecord(value) && 'repositories_added' in value && 'repositories_removed' in value;
}

/* ------------------------------------------------------------------ */
/*  Event dispatch                                                     */
/* ------------------------------------------------------------------ */

async function dispatchInstallationEvent(payload: WebhookInstallationPayload): Promise<void> {
  const supabase = createServiceClient();

  switch (payload.action) {
    case 'created':
      await handleInstallationCreated(supabase, payload);
      break;
    case 'deleted':
      await handleInstallationDeleted(supabase, payload);
      break;
    case 'suspend':
      await handleInstallationSuspend(supabase, payload);
      break;
    case 'unsuspend':
      await handleInstallationUnsuspend(supabase, payload);
      break;
  }
}

async function dispatchReposEvent(payload: WebhookInstallationReposPayload): Promise<void> {
  const supabase = createServiceClient();

  switch (payload.action) {
    case 'added':
      await handleReposAdded(supabase, payload);
      break;
    case 'removed':
      await handleReposRemoved(supabase, payload);
      break;
  }
}

async function dispatchEvent(event: string, body: unknown): Promise<void> {
  if (event === 'installation' && isInstallationPayload(body)) {
    await dispatchInstallationEvent(body);
  } else if (event === 'installation_repositories' && isReposPayload(body)) {
    await dispatchReposEvent(body);
  }
}

/* ------------------------------------------------------------------ */
/*  Body parsing                                                       */
/* ------------------------------------------------------------------ */

function getRawBody(req: Request): string {
  return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
}

function parseBody(req: Request): unknown {
  return typeof req.body === 'string' ? (JSON.parse(req.body) as unknown) : req.body;
}

/* ------------------------------------------------------------------ */
/*  Route handler                                                      */
/* ------------------------------------------------------------------ */

/**
 * POST /webhooks/github
 *
 * This route receives the raw body as a string for signature verification.
 * express.text({ type: 'application/json' }) is used per-route in server.ts.
 */
export async function handleGitHubWebhook(req: Request, res: Response): Promise<void> {
  const signature = getSignatureHeader(req);
  const event = getEventHeader(req);

  if (signature === undefined) {
    res.status(HTTP_UNAUTHORIZED).json({ error: 'Missing signature' });
    return;
  }

  if (event === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Missing event header' });
    return;
  }

  const rawBody = getRawBody(req);

  if (!verifyWebhookSignature(rawBody, signature)) {
    res.status(HTTP_UNAUTHORIZED).json({ error: 'Invalid signature' });
    return;
  }

  try {
    const body = parseBody(req);
    logGitHub('webhook', `event=${event}`);
    await dispatchEvent(event, body);
    res.status(HTTP_OK).json({ ok: true });
  } catch (err) {
    logGitHubError('webhook', extractErrorMessage(err));
    res.status(HTTP_INTERNAL_ERROR).json({ error: 'Webhook processing failed' });
  }
}
