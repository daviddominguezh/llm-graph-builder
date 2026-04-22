import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { failExecution } from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ExecutionResult } from '../../notifications/completionNotifier.js';
import { getCompletionConfig, getNotifier } from '../../notifications/notifierSingleton.js';
import type { ExecutionAuthLocals, ExecutionAuthResponse } from './executeAuth.js';
import type { ExecuteCoreCallbacks, ExecuteCoreOutput } from './executeCore.js';
import { executeAgentCore } from './executeCore.js';
import { HttpError } from './executeFetcher.js';
import {
  logExec,
  sendNodeProcessedEvent,
  sendNodeVisitedEvent,
  setSseHeaders,
  writePublicSSE,
} from './executeHelpers.js';
import { buildEmptyResponse, buildResponseByType } from './executeResponseBuilders.js';
import type { AgentExecutionInput, AgentExecutionResponse } from './executeTypes.js';
import { AgentExecutionInputSchema } from './executeTypes.js';
import { createSupabaseTenantLookup, enforceWebChannelOrigin } from './originGuard.js';

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

async function enforceOriginIfWebChannel(
  req: Request<{ agentSlug: string; version: string }>,
  parsed: ParsedInput
): Promise<void> {
  if (parsed.input.channel !== 'web') return;
  const outcome = await enforceWebChannelOrigin({
    req,
    lookupTenant: createSupabaseTenantLookup(parsed.supabase),
    tenantId: parsed.input.tenantId,
    keyOrgId: parsed.orgId,
  });
  if (!outcome.ok) throw new HttpError(outcome.status, outcome.error);
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

/* ─── Non-streaming handler helpers ─── */

function respondNormally(result: ExecuteCoreOutput, res: Response): void {
  if (result.output === null) {
    res.json(buildEmptyResponse(result.appType));
  } else {
    res.json(buildResponseByType(result.appType, result.output, result.durationMs));
  }
}

function buildBaseResponse(result: ExecuteCoreOutput): AgentExecutionResponse {
  if (result.output === null) {
    return buildEmptyResponse(result.appType);
  }
  return buildResponseByType(result.appType, result.output, result.durationMs);
}

function respondWithCompletion(
  result: ExecuteCoreOutput,
  completionResult: ExecutionResult | null,
  executionId: string,
  res: Response
): void {
  const response = buildBaseResponse(result);

  if (completionResult === null) {
    res.json({ ...response, executionId });
  } else {
    res.json({ ...response, text: completionResult.text, executionId });
  }
}

/* ─── Non-streaming handler ─── */

async function handleNonStreaming(parsed: ParsedInput, res: Response): Promise<void> {
  const notifier = getNotifier();
  const config = getCompletionConfig();
  const executionId = randomUUID();

  const waitPromise = notifier.waitForCompletion(executionId, config.timeoutMs);

  const result = await executeAgentCore({
    supabase: parsed.supabase,
    orgId: parsed.orgId,
    agentId: parsed.agentId,
    version: parsed.version,
    input: parsed.input,
    executionId,
    rootExecutionId: executionId,
  });

  if (result.output?.dispatchResult === undefined) {
    respondNormally(result, res);
    return;
  }

  logExec('waiting for composition', { executionId });
  const completionResult = await waitPromise;
  respondWithCompletion(result, completionResult, executionId, res);
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
    await enforceOriginIfWebChannel(req, parsed);

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
