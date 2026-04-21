import express from 'express';
import type { Request } from 'express';

import { getEndUser } from '../queries/endUserQueries.js';
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

function decodeUserId(req: Request): string {
  return decodeURIComponent(getRequiredParam(req, 'userId'));
}

async function handleGetUser(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const tenantId = getRequiredParam(req, 'tenantId');
    const userChannelId = decodeUserId(req);

    if (userChannelId.trim() === '') {
      res.status(HTTP_BAD_REQUEST).json({ error: 'userId is required' });
      return;
    }

    const user = await getEndUser(getSupabase(res), tenantId, userChannelId);
    if (user === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'User not found' });
      return;
    }

    res.status(HTTP_OK).json({ user });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const usersRouter = express.Router({ mergeParams: true });
usersRouter.get('/:userId', handleGetUser);
