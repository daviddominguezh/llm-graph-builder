import express from 'express';
import type { Request } from 'express';

import { addAssignee, addStatus, getAssignees } from '../queries/assignmentQueries.js';
import {
  deleteConversationWithTombstone,
  markConversationRead,
  updateConversationEnabled,
} from '../queries/conversationMutations.js';
import { findConversationByUserChannelId } from '../queries/conversationQueries.js';
import { getAllMessages, getMessagePage } from '../queries/messageQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { assignChatToAgent, reassignChat, releaseChat } from '../services/workloadManager.js';
import type { AssigneeBody, ConversationRow, StatusBody } from '../types/index.js';
import type { MessagingResponse } from './routeHelpers.js';
import {
  HTTP_BAD_REQUEST,
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
    await deleteConversationWithTombstone(supabase, conversation.id, tenantId);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

async function applyAssigneeWorkload(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  assignee: string
): Promise<void> {
  const assignees = await getAssignees(supabase, conversation.id);
  const previousAssignee = assignees[0]?.assignee;

  if (previousAssignee !== undefined && previousAssignee !== assignee) {
    await reassignChat(supabase, conversation.tenant_id, conversation.user_channel_id, previousAssignee, assignee);
  } else if (previousAssignee === undefined) {
    await assignChatToAgent(supabase, conversation.tenant_id, conversation.user_channel_id, assignee);
  }
}

/* POST /projects/:tenantId/conversations/:userId/assignee */
async function handleAddAssignee(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const conversation = await lookupConversation(req, res);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    const body = req.body as AssigneeBody;
    const assignee = (body.assignee ?? '').trim();
    if (assignee === '') {
      res.status(HTTP_BAD_REQUEST).json({ error: 'assignee is required' });
      return;
    }

    const supabase = getSupabase(res);
    await applyAssigneeWorkload(supabase, conversation, assignee);
    await addAssignee(supabase, conversation.id, assignee);
    await updateConversationEnabled(supabase, conversation.id, false);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

async function applyStatusSideEffects(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  status: string
): Promise<void> {
  const isTerminal = status === 'closed' || status === 'blocked';
  if (!isTerminal) {
    return;
  }

  await updateConversationEnabled(supabase, conversation.id, false);

  const assignees = await getAssignees(supabase, conversation.id);
  const currentAssignee = assignees[0]?.assignee;
  if (currentAssignee !== undefined) {
    await releaseChat(supabase, conversation.tenant_id, conversation.user_channel_id, currentAssignee);
  }
}

/* POST /projects/:tenantId/conversations/:userId/status */
async function handleAddStatus(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const conversation = await lookupConversation(req, res);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    const body = req.body as StatusBody;
    const status = (body.status ?? '').trim();
    if (status === '') {
      res.status(HTTP_BAD_REQUEST).json({ error: 'status is required' });
      return;
    }

    const supabase = getSupabase(res);
    await addStatus(supabase, conversation.id, status);
    await applyStatusSideEffects(supabase, conversation, status);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const conversationsRouter = express.Router({ mergeParams: true });
conversationsRouter.get('/:userId', handleGetMessages);
conversationsRouter.post('/:userId/read', handleMarkRead);
conversationsRouter.post('/:userId/chatbot', handleToggleChatbot);
conversationsRouter.post('/:userId/assignee', handleAddAssignee);
conversationsRouter.post('/:userId/status', handleAddStatus);
conversationsRouter.delete('/:userId', handleDeleteConversation);
