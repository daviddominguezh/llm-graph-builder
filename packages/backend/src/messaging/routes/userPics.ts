import express from 'express';
import type { Request } from 'express';

import { createServiceClient } from '../../db/queries/executionAuthQueries.js';
import type { MessagingResponse } from './routeHelpers.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL,
  HTTP_OK,
  extractErrorMessage,
  getRequiredParam,
} from './routeHelpers.js';

interface ProfileRow {
  avatar_url: string | null;
}

function isProfileRow(val: unknown): val is ProfileRow {
  return typeof val === 'object' && val !== null && 'avatar_url' in val;
}

function extractAvatarFromMeta(meta: Record<string, unknown>): string | undefined {
  const url: unknown = meta.avatar_url;
  return typeof url === 'string' ? url : undefined;
}

function extractUserAvatar(
  users: Array<{ email?: string; user_metadata: Record<string, unknown> }>,
  email: string
): string | undefined {
  const match = users.find((u) => u.email === email);
  if (match === undefined) return undefined;
  return extractAvatarFromMeta(match.user_metadata);
}

async function lookupProfileAvatar(email: string): Promise<string> {
  const service = createServiceClient();
  const result: { data: unknown; error: unknown } = await service
    .from('profiles')
    .select('avatar_url')
    .eq('email', email)
    .single();

  if (result.data !== null && isProfileRow(result.data)) {
    return result.data.avatar_url ?? '';
  }
  return '';
}

async function lookupAvatarByEmail(email: string): Promise<string> {
  const service = createServiceClient();
  const {
    data: { users },
  } = await service.auth.admin.listUsers();
  const avatar = extractUserAvatar(users, email);
  if (avatar !== undefined) return avatar;
  return await lookupProfileAvatar(email);
}

async function handleGetPic(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const email = decodeURIComponent(getRequiredParam(req, 'email'));
    if (email.trim() === '') {
      res.status(HTTP_BAD_REQUEST).json({ error: 'email is required' });
      return;
    }

    const url = await lookupAvatarByEmail(email);
    res.status(HTTP_OK).json({ url });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const userPicsRouter = express.Router({ mergeParams: true });
userPicsRouter.get('/:email/pic', handleGetPic);
