import type { Request } from 'express';

import { type RagFileRow, getRagFileById } from '../../../db/queries/ragFilesQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
} from '../../routeHelpers.js';
import { getFileIdParam } from './ragFileHelpers.js';

const POLL_MS = 1000;
const TERMINAL_STATUSES = new Set<string>(['done', 'failed']);

function setSseHeaders(res: AuthenticatedResponse): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function writeStatusEvent(res: AuthenticatedResponse, file: RagFileRow): void {
  const payload = JSON.stringify({
    status: file.status,
    statusError: file.status_error,
    pageCount: file.page_count,
  });
  res.write(`data: ${payload}\n\n`);
}

interface PollContext {
  supabase: AuthenticatedLocals['supabase'];
  fileId: string;
  res: AuthenticatedResponse;
  getLastStatus: () => string;
  setLastStatus: (s: string) => void;
  isClosed: () => boolean;
}

async function tick(ctx: PollContext): Promise<void> {
  if (ctx.isClosed()) return;
  const { result } = await getRagFileById(ctx.supabase, ctx.fileId);
  if (result === null) {
    ctx.res.write('event: gone\ndata: {}\n\n');
    ctx.res.end();
    return;
  }
  if (result.status !== ctx.getLastStatus()) {
    ctx.setLastStatus(result.status);
    writeStatusEvent(ctx.res, result);
  }
  if (TERMINAL_STATUSES.has(result.status)) {
    ctx.res.end();
    return;
  }
  setTimeout(() => {
    void tick(ctx);
  }, POLL_MS);
}

function buildContext(
  supabase: AuthenticatedLocals['supabase'],
  fileId: string,
  res: AuthenticatedResponse,
  req: Request
): PollContext {
  const state = { lastStatus: '', closed: false };
  req.on('close', () => {
    state.closed = true;
  });
  return {
    supabase,
    fileId,
    res,
    getLastStatus: () => state.lastStatus,
    setLastStatus: (s) => {
      state.lastStatus = s;
    },
    isClosed: () => state.closed,
  };
}

export async function handleStreamStatus(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const fileId = getFileIdParam(req);
  if (fileId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'file id required' });
    return;
  }
  setSseHeaders(res);
  await tick(buildContext(supabase, fileId, res, req));
}
