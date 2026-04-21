import express from 'express';
import type { Request } from 'express';

import type { MessagingResponse } from './routeHelpers.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL,
  HTTP_OK,
  extractErrorMessage,
  getOptionalQuery,
  getRequiredParam,
} from './routeHelpers.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface MediaBody {
  id: string;
  link: string;
  kind: string;
  status: string;
}

function extractMediaBody(body: unknown): MediaBody | null {
  if (!isRecord(body)) return null;
  const { id, link, kind, status } = body;
  if (typeof id !== 'string') return null;
  if (typeof link !== 'string') return null;
  if (typeof kind !== 'string') return null;
  if (typeof status !== 'string') return null;
  return { id, link, kind, status };
}

function handleRegisterMedia(req: Request, res: MessagingResponse): void {
  try {
    getRequiredParam(req, 'tenantId');
    const groupName = getOptionalQuery(req, 'groupName');
    const fileId = getOptionalQuery(req, 'fileId');

    if (groupName === undefined || fileId === undefined) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'groupName and fileId query params required' });
      return;
    }

    const body = extractMediaBody(req.body);
    if (body === null) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'id, link, kind, and status are required' });
      return;
    }

    res.status(HTTP_OK).json({ message: 'ok' });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

function handleAnalyzeMedia(req: Request, res: MessagingResponse): void {
  try {
    getRequiredParam(req, 'tenantId');
    const url = getOptionalQuery(req, 'url');
    const kind = getOptionalQuery(req, 'kind');

    if (url === undefined || kind === undefined) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'url and kind query params required' });
      return;
    }

    res.status(HTTP_OK).json({ content: '' });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const mediaRouter = express.Router({ mergeParams: true });
mediaRouter.post('/', handleRegisterMedia);
mediaRouter.get('/analyze', handleAnalyzeMedia);
