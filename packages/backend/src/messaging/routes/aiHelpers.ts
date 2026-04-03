import express from 'express';
import type { Request } from 'express';

import type { AiHelperRequest } from '../types/index.js';
import { callLlm, resolveApiKey } from './aiHelperLlm.js';
import { PROMPT_ANSWER, PROMPT_FORMAL, PROMPT_FRIENDLY, PROMPT_GRAMMAR } from './aiHelperPrompts.js';
import type { MessagingResponse } from './routeHelpers.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL,
  HTTP_OK,
  extractErrorMessage,
  getRequiredParam,
  getSupabase,
} from './routeHelpers.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseHelperBody(body: unknown): AiHelperRequest | null {
  if (!isRecord(body)) return null;
  const { text, agentId, context } = body;
  if (typeof text !== 'string' || typeof agentId !== 'string') return null;
  const ctx = typeof context === 'string' ? context : undefined;
  return { text, agentId, context: ctx };
}

async function processHelper(
  req: Request,
  res: MessagingResponse,
  systemPrompt: string,
  buildUserText: (body: AiHelperRequest) => string
): Promise<void> {
  try {
    getRequiredParam(req, 'tenantId');
    const body = parseHelperBody(req.body);
    if (body === null) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'text and agentId are required' });
      return;
    }

    const apiKey = await resolveApiKey(getSupabase(res), body.agentId);
    const result = await callLlm(apiKey, systemPrompt, buildUserText(body));
    res.status(HTTP_OK).json({ text: result });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

function textOnly(body: AiHelperRequest): string {
  return body.text;
}

function textWithContext(body: AiHelperRequest): string {
  const ctx = body.context ?? '';
  if (ctx === '') return body.text;
  return `Context:\n${ctx}\n\nQuestion:\n${body.text}`;
}

async function handleFriendly(req: Request, res: MessagingResponse): Promise<void> {
  await processHelper(req, res, PROMPT_FRIENDLY, textOnly);
}

async function handleFormal(req: Request, res: MessagingResponse): Promise<void> {
  await processHelper(req, res, PROMPT_FORMAL, textOnly);
}

async function handleGrammar(req: Request, res: MessagingResponse): Promise<void> {
  await processHelper(req, res, PROMPT_GRAMMAR, textOnly);
}

async function handleAnswer(req: Request, res: MessagingResponse): Promise<void> {
  await processHelper(req, res, PROMPT_ANSWER, textWithContext);
}

export const aiHelpersRouter = express.Router({ mergeParams: true });
aiHelpersRouter.post('/make-friendly', handleFriendly);
aiHelpersRouter.post('/make-formal', handleFormal);
aiHelpersRouter.post('/fix-grammar', handleGrammar);
aiHelpersRouter.post('/answer-question', handleAnswer);
