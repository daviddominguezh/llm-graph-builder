import express from 'express';
import type { Request } from 'express';

import {
  deleteConversation,
  insertDeletedConversation,
  markConversationRead,
  updateConversationEnabled,
} from '../queries/conversationMutations.js';
import { findConversationByUserChannelId } from '../queries/conversationQueries.js';
import { getAllMessages, getMessagePage } from '../queries/messageQueries.js';
import type { ConversationRow } from '../types/index.js';
import type { MessagingResponse } from './routeHelpers.js';
import {
  HTTP_INTERNAL,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
  getOptionalQuery,
  getRequiredParam,
  getSupabase,
} from './routeHelpers.js';

function decodeUserId(req: Request): string {
  return decodeURIComponent(getRequiredParam(req, 'userId'));
}

async function lookupConversation(req: Request, res: MessagingResponse): Promise<ConversationRow | null> {
  const supabase = getSupabase(res);
  const tenantId = getRequiredParam(req, 'tenantId');
  const userChannelId = decodeUserId(req);
  return await findConversationByUserChannelId(supabase, tenantId, userChannelId);
}

async function handlePaginatedMessages(
  req: Request,
  res: MessagingResponse,
  conversationId: string
): Promise<void> {
  const supabase = getSupabase(res);
  const cursorTimestamp = getOptionalQuery(req, 'cursorTimestamp');
  const cursorKey = getOptionalQuery(req, 'cursorKey');
  const cursor =
    cursorTimestamp !== undefined && cursorKey !== undefined
      ? { timestamp: Number(cursorTimestamp), key: cursorKey }
      : undefined;

  const page = await getMessagePage(supabase, { conversationId, cursor });
  res.status(HTTP_OK).json({
    messages: page.messages,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  });
}

async function handleAllMessages(
  req: Request,
  res: MessagingResponse,
  conversationId: string
): Promise<void> {
  const supabase = getSupabase(res);
  const fromMessage = getOptionalQuery(req, 'fromMessage');
  const fromTs = fromMessage === undefined ? undefined : Number(fromMessage);
  const messages = await getAllMessages(supabase, {
    conversationId,
    fromTimestamp: Number.isNaN(fromTs) ? undefined : fromTs,
  });
  res.status(HTTP_OK).json({ messages });
}

/* GET /projects/:tenantId/conversations/:userId — messages */
async function handleGetMessages(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const conversation = await lookupConversation(req, res);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    const paginate = getOptionalQuery(req, 'paginate') === 'true';
    if (paginate) {
      await handlePaginatedMessages(req, res, conversation.id);
      return;
    }

    await handleAllMessages(req, res, conversation.id);
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* POST /projects/:tenantId/conversations/:userId/read */
async function handleMarkRead(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const conversation = await lookupConversation(req, res);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    await markConversationRead(getSupabase(res), conversation.id);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* POST /projects/:tenantId/conversations/:userId/chatbot */
async function handleToggleChatbot(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const conversation = await lookupConversation(req, res);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    const enabled = getOptionalQuery(req, 'enabled') === 'true';
    await updateConversationEnabled(getSupabase(res), conversation.id, enabled);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* DELETE /projects/:tenantId/conversations/:userId */
async function handleDeleteConversation(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const tenantId = getRequiredParam(req, 'tenantId');
    const conversation = await lookupConversation(req, res);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    const supabase = getSupabase(res);
    await insertDeletedConversation(supabase, conversation.id, tenantId);
    await deleteConversation(supabase, conversation.id);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const conversationsRouter = express.Router({ mergeParams: true });
conversationsRouter.get('/:userId', handleGetMessages);
conversationsRouter.post('/:userId/read', handleMarkRead);
conversationsRouter.post('/:userId/chatbot', handleToggleChatbot);
conversationsRouter.delete('/:userId', handleDeleteConversation);
