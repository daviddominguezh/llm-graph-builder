import type { Request, Response } from 'express';

import { failExecution } from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ExecutionAuthLocals, ExecutionAuthResponse } from './executeAuth.js';
import { executeAgentCore } from './executeCore.js';
import type { ExecuteCoreCallbacks } from './executeCore.js';
import { HttpError } from './executeFetcher.js';
import {
  logExec,
  sendNodeProcessedEvent,
  sendNodeVisitedEvent,
  setSseHeaders,
  writePublicSSE,
} from './executeHelpers.js';
import { buildEmptyResponse, buildResponseByType } from './executeResponseBuilders.js';
import type { AgentExecutionInput } from './executeTypes.js';
import { AgentExecutionInputSchema } from './executeTypes.js';

const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL = 500;

/* ─── Input parsing ─── */

interface ParsedInput {
  input: AgentExecutionInput;
  orgId: string;
  agentId: string;
  version: number;
  supabase: SupabaseClient;
}

function parseRequest(
  req: Request<{ agentSlug: string; version: string }>,
  res: ExecutionAuthResponse
): ParsedInput {
  const parsed = AgentExecutionInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(HTTP_BAD_REQUEST, parsed.error.message);

  const { orgId, agentId, version, supabase }: ExecutionAuthLocals = res.locals;
  return { input: parsed.data, orgId, agentId, version, supabase };
}

/* ─── Streaming handler ─── */

async function handleStreaming(parsed: ParsedInput, res: Response): Promise<void> {
  setSseHeaders(res);

  const callbacks: ExecuteCoreCallbacks = {
    onNodeVisited: (nodeId) => {
      sendNodeVisitedEvent(res, nodeId);
    },
    onNodeProcessed: (event) => {
      sendNodeProcessedEvent(res, event);
    },
  };

  const result = await executeAgentCore(
    {
      supabase: parsed.supabase,
      orgId: parsed.orgId,
      agentId: parsed.agentId,
      version: parsed.version,
      input: parsed.input,
    },
    callbacks
  );

  if (result.output !== null) {
    const response = buildResponseByType(result.appType, result.output, result.durationMs);
    writePublicSSE(res, { type: 'done', response });
  }
}

/* ─── Non-streaming handler ─── */

async function handleNonStreaming(parsed: ParsedInput, res: Response): Promise<void> {
  const result = await executeAgentCore({
    supabase: parsed.supabase,
    orgId: parsed.orgId,
    agentId: parsed.agentId,
    version: parsed.version,
    input: parsed.input,
  });

  if (result.output !== null) {
    res.json(buildResponseByType(result.appType, result.output, result.durationMs));
    return;
  }

  res.json(buildEmptyResponse(result.appType));
}

/* ─── Error handler ─── */

async function handleExecutionError(
  err: unknown,
  executionId: string | undefined,
  supabase: SupabaseClient | undefined,
  res: Response
): Promise<void> {
  const message = err instanceof Error ? err.message : 'Execution failed';
  const status = err instanceof HttpError ? err.status : HTTP_INTERNAL;

  if (executionId !== undefined && supabase !== undefined) {
    try {
      await failExecution(supabase, executionId, message);
    } catch {
      process.stdout.write('[execute] failExecution error ignored\n');
    }
  }

  if (res.headersSent) {
    writePublicSSE(res, { type: 'error', message });
  } else {
    res.status(status).json({ error: message });
  }
}

/* ─── Main handler ─── */

export async function handleExecute(
  req: Request<{ agentSlug: string; version: string }>,
  res: ExecutionAuthResponse
): Promise<void> {
  let supabase: SupabaseClient | undefined = undefined;

  try {
    const parsed = parseRequest(req, res);
    ({ supabase } = parsed);

    logExec('routing execution', { stream: parsed.input.stream });

    if (parsed.input.stream) {
      await handleStreaming(parsed, res);
    } else {
      await handleNonStreaming(parsed, res);
    }

    logExec('execution completed');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logExec('execution error', { error: errMsg });
    await handleExecutionError(err, undefined, supabase, res);
  } finally {
    if (res.headersSent && !res.writableEnded) {
      res.end();
    }
  }
}
