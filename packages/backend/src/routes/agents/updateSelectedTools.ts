import type { Request } from 'express';
import { type SelectedTool, PatchSelectedToolsBodySchema } from '@daviddh/llm-graph-runner';

import {
  type UpdateSelectedToolsResult,
  fetchAgentSelectedTools,
  updateSelectedToolsWithPrecondition,
} from '../../db/queries/selectedToolsOperations.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

const HTTP_CONFLICT = 409;
const HTTP_NOT_FOUND = 404;

function sendBadRequest(res: AuthenticatedResponse, message: string): void {
  res.status(HTTP_BAD_REQUEST).json({ error: message });
}

function sendConflict(
  res: AuthenticatedResponse,
  current: { selected_tools: SelectedTool[]; updated_at: string }
): void {
  res.status(HTTP_CONFLICT).json({
    error: 'conflict',
    current_tools: current.selected_tools,
    current_updated_at: current.updated_at,
  });
}

function sendOk(
  res: AuthenticatedResponse,
  result: Extract<UpdateSelectedToolsResult, { kind: 'ok' }>
): void {
  res.status(HTTP_OK).json({
    selected_tools: result.row.selected_tools,
    updated_at: result.row.updated_at,
  });
}

async function handleConflict(
  res: AuthenticatedResponse,
  supabase: AuthenticatedLocals['supabase'],
  agentId: string
): Promise<void> {
  const current = await fetchAgentSelectedTools(supabase, agentId);
  if (current === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agent not found' });
    return;
  }
  sendConflict(res, current);
}

export async function handleUpdateSelectedTools(
  req: Request,
  res: AuthenticatedResponse
): Promise<void> {
  const agentId = getAgentId(req);
  if (agentId === undefined) {
    sendBadRequest(res, 'agentId required');
    return;
  }

  const parse = PatchSelectedToolsBodySchema.safeParse(req.body);
  if (!parse.success) {
    sendBadRequest(res, parse.error.message);
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;
  try {
    const result = await updateSelectedToolsWithPrecondition(supabase, {
      agentId,
      tools: parse.data.tools,
      expectedUpdatedAt: parse.data.expectedUpdatedAt,
    });
    if (result.kind === 'conflict') {
      await handleConflict(res, supabase, agentId);
      return;
    }
    sendOk(res, result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
