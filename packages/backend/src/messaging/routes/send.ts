import express from 'express';
import type { Request } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { processSendMessage } from '../controllers/messageProcessor.js';
import {
  deleteConversation,
  insertDeletedConversation,
} from '../queries/conversationMutations.js';
import { findConversationByUserChannelId } from '../queries/conversationQueries.js';
import type { SendMessageBody, SendTestMessageBody } from '../types/index.js';
import type { MessagingResponse } from './routeHelpers.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
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

/* ─── Validation helpers ─── */

function isValidSendBody(body: SendMessageBody): boolean {
  return Boolean(body.message && body.userID && body.tenantId && body.agentId);
}

function isValidTestBody(body: SendTestMessageBody): boolean {
  return Boolean(body.message && body.tenantId && body.agentId);
}

/* POST /messages/message */
async function handleSendMessage(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const body = req.body as SendMessageBody;

    if (!isValidSendBody(body)) {
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
      type: body.type ?? 'text',
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
    const body = req.body as SendTestMessageBody;

    if (!isValidTestBody(body)) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Missing required fields' });
      return;
    }

    // Test messages save as 'user' role and invoke AI.
    // This will be completed in Task 22 (processIncomingMessage).
    // For now, respond 200.
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* DELETE /messages/:tenantId/:from */
async function handleDeleteFromSend(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = req.params.tenantId as string;
    const userChannelId = decodeURIComponent(req.params.from as string);

    const conversation = await findConversationByUserChannelId(supabase, tenantId, userChannelId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    await insertDeletedConversation(supabase, conversation.id, tenantId);
    await deleteConversation(supabase, conversation.id);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const sendRouter = express.Router();
sendRouter.post('/message', handleSendMessage);
sendRouter.post('/test', handleTestMessage);
sendRouter.delete('/:tenantId/:from', handleDeleteFromSend);
