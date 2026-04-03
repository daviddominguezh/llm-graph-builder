import express from 'express';
import type { Request } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { processTestMessage } from '../controllers/incomingProcessor.js';
import { processSendMessage } from '../controllers/messageProcessor.js';
import { deleteConversationWithTombstone } from '../queries/conversationMutations.js';
import { findConversationByUserChannelId } from '../queries/conversationQueries.js';
import type { SendMessageBody, SendTestMessageBody } from '../types/index.js';
import type { MessagingResponse } from './routeHelpers.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
  getRequiredParam,
  getSupabase,
} from './routeHelpers.js';

/* ─── Resolve orgId from agent ─── */

interface AgentOrgRow {
  org_id: string;
}

async function getOrgIdFromAgent(supabase: SupabaseClient, agentId: string): Promise<string> {
  const result = await supabase.from('agents').select('org_id').eq('id', agentId).single();
  const row = result.data as AgentOrgRow | null;
  if (row === null) throw new Error('Agent not found');
  return row.org_id;
}

/* ─── Type guards ─── */

function isRecord(body: unknown): body is Record<string, unknown> {
  return typeof body === 'object' && body !== null;
}

function hasNonEmptyString(rec: Record<string, unknown>, key: string): boolean {
  return typeof rec[key] === 'string' && rec[key] !== '';
}

function isSendMessageBody(body: unknown): body is SendMessageBody {
  if (!isRecord(body)) return false;
  return (
    hasNonEmptyString(body, 'message') &&
    hasNonEmptyString(body, 'userID') &&
    hasNonEmptyString(body, 'tenantId') &&
    hasNonEmptyString(body, 'agentId')
  );
}

function isTestMessageBody(body: unknown): body is SendTestMessageBody {
  if (!isRecord(body)) return false;
  return (
    hasNonEmptyString(body, 'message') &&
    hasNonEmptyString(body, 'tenantId') &&
    hasNonEmptyString(body, 'agentId')
  );
}

/* POST /messages/message */
async function handleSendMessage(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const body: unknown = req.body;

    if (!isSendMessageBody(body)) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Missing required fields' });
      return;
    }
    const orgId = await getOrgIdFromAgent(supabase, body.agentId);

    await processSendMessage({
      supabase,
      orgId,
      agentId: body.agentId,
      tenantId: body.tenantId,
      userChannelId: body.userID,
      content: body.message,
      type: body.type,
      clientMessageId: body.id,
    });

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* POST /messages/test */
async function handleTestMessage(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const body: unknown = req.body;

    if (!isTestMessageBody(body)) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Missing required fields' });
      return;
    }
    const orgId = await getOrgIdFromAgent(supabase, body.agentId);

    await processTestMessage({
      supabase,
      orgId,
      agentId: body.agentId,
      tenantId: body.tenantId,
      content: body.message,
      type: body.type,
      clientMessageId: body.id,
    });

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* DELETE /messages/:tenantId/:from */
async function handleDeleteFromSend(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = getRequiredParam(req, 'tenantId');
    const userChannelId = decodeURIComponent(getRequiredParam(req, 'from'));

    const conversation = await findConversationByUserChannelId(supabase, tenantId, userChannelId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    await deleteConversationWithTombstone(supabase, conversation.id, tenantId);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const sendRouter = express.Router();
sendRouter.post('/message', handleSendMessage);
sendRouter.post('/test', handleTestMessage);
sendRouter.delete('/:tenantId/:from', handleDeleteFromSend);
