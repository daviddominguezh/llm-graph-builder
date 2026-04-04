import express from 'express';
import type { Request } from 'express';

import { buildSnapshots } from '../controllers/snapshotBuilder.js';
import { getDeletedConversations } from '../queries/conversationMutations.js';
import { getAllInbox, getInboxDelta, getInboxPage } from '../queries/conversationQueries.js';
import type { MessagingResponse } from './routeHelpers.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL,
  HTTP_OK,
  extractErrorMessage,
  getOptionalQuery,
  getRequiredParam,
  getSupabase,
} from './routeHelpers.js';

const MIN_TIMESTAMP = 0;

/* GET /projects/:tenantId/messages/last */
async function handlePaginatedInbox(req: Request, res: MessagingResponse): Promise<void> {
  const supabase = getSupabase(res);
  const tenantId = getRequiredParam(req, 'tenantId');
  const cursorTimestamp = getOptionalQuery(req, 'cursorTimestamp');
  const cursorKey = getOptionalQuery(req, 'cursorKey');
  const cursor =
    cursorTimestamp !== undefined && cursorKey !== undefined
      ? { timestamp: Number(cursorTimestamp), key: cursorKey }
      : undefined;

  const page = await getInboxPage(supabase, { tenantId, cursor });
  const snapshots = await buildSnapshots(supabase, page.conversations);

  // Frontend expects { messages: Record<key, LastMessage>, hasMore, nextCursor }
  const messages: Record<string, (typeof snapshots)[number]> = {};
  for (const snap of snapshots) {
    messages[snap.key] = snap;
  }

  res.status(HTTP_OK).json({
    messages,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor ?? undefined,
  });
}

async function handleFullInbox(req: Request, res: MessagingResponse): Promise<void> {
  const supabase = getSupabase(res);
  const tenantId = getRequiredParam(req, 'tenantId');

  const conversations = await getAllInbox(supabase, tenantId);
  const snapshots = await buildSnapshots(supabase, conversations);

  const messages: Record<string, (typeof snapshots)[number]> = {};
  for (const snap of snapshots) {
    messages[snap.key] = snap;
  }
  res.status(HTTP_OK).json(messages);
}

async function handleGetInbox(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const paginate = getOptionalQuery(req, 'paginate') === 'true';

    if (paginate) {
      await handlePaginatedInbox(req, res);
      return;
    }

    await handleFullInbox(req, res);
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* GET /projects/:tenantId/messages/last/delta */
async function handleGetDelta(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = getRequiredParam(req, 'tenantId');
    const timestampRaw = getOptionalQuery(req, 'timestamp');

    if (timestampRaw === undefined) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Missing timestamp query param' });
      return;
    }

    const timestampNum = Number(timestampRaw);
    if (Number.isNaN(timestampNum) || timestampNum <= MIN_TIMESTAMP) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid timestamp query param' });
      return;
    }

    const sinceIso = new Date(timestampNum).toISOString();
    const conversations = await getInboxDelta(supabase, tenantId, sinceIso);
    const snapshots = await buildSnapshots(supabase, conversations);
    res.status(HTTP_OK).json(snapshots);
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* GET /projects/:tenantId/messages/last/deleted */
async function handleGetDeleted(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = getRequiredParam(req, 'tenantId');
    const sinceRaw = getOptionalQuery(req, 'since');

    if (sinceRaw === undefined) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Missing since query param' });
      return;
    }

    const sinceNum = Number(sinceRaw);
    if (Number.isNaN(sinceNum) || sinceNum <= MIN_TIMESTAMP) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid since query param' });
      return;
    }

    const sinceIso = new Date(sinceNum).toISOString();
    const ids = await getDeletedConversations(supabase, tenantId, sinceIso);
    res.status(HTTP_OK).json({ deletedChats: ids });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const inboxRouter = express.Router({ mergeParams: true });
inboxRouter.get('/last', handleGetInbox);
inboxRouter.get('/last/delta', handleGetDelta);
inboxRouter.get('/last/deleted', handleGetDeleted);
