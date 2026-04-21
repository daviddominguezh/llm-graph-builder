import type { Request, Response } from 'express';

import { createServiceClient } from '../../db/queries/executionAuthQueries.js';

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL = 500;
const LAST_MESSAGE_LIMIT = 1;

interface ExecutionIdParams {
  executionId?: string;
}

interface ExecutionStatusRow {
  status: string;
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

interface LastMessageRow {
  content: unknown;
}

type ExecutionStatus = 'completed' | 'failed' | 'running' | 'suspended';

interface ResultResponse {
  executionId: string;
  status: 'completed' | 'error' | 'running';
  text?: string;
}

const EXECUTION_STATUSES = ['completed', 'failed', 'running', 'suspended'] as const;

function isKnownStatus(value: string): value is ExecutionStatus {
  return (EXECUTION_STATUSES as readonly string[]).includes(value);
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (typeof content === 'object' && content !== null && 'text' in content) {
    return String((content as Record<string, unknown>).text);
  }
  return '';
}

async function fetchExecutionStatus(
  supabase: ReturnType<typeof createServiceClient>,
  executionId: string
): Promise<ExecutionStatus | null> {
  const result: QueryResult<ExecutionStatusRow> = await supabase
    .from('agent_executions')
    .select('status')
    .eq('id', executionId)
    .single();

  if (result.error !== null || result.data === null) return null;
  return isKnownStatus(result.data.status) ? result.data.status : null;
}

async function fetchLastAssistantMessage(
  supabase: ReturnType<typeof createServiceClient>,
  executionId: string
): Promise<unknown> {
  const result: QueryResult<LastMessageRow> = await supabase
    .from('agent_execution_messages')
    .select('content')
    .eq('execution_id', executionId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(LAST_MESSAGE_LIMIT)
    .single();

  if (result.error !== null || result.data === null) return null;
  return result.data.content;
}

function buildRunningResponse(executionId: string): ResultResponse {
  return { status: 'running', executionId };
}

function buildErrorResponse(executionId: string): ResultResponse {
  return { status: 'error', text: '', executionId };
}

async function buildCompletedResponse(
  supabase: ReturnType<typeof createServiceClient>,
  executionId: string
): Promise<ResultResponse> {
  const content = await fetchLastAssistantMessage(supabase, executionId);
  const text = extractText(content);
  return { status: 'completed', text, executionId };
}

function resolveResponse(
  status: ExecutionStatus,
  supabase: ReturnType<typeof createServiceClient>,
  executionId: string
): Promise<ResultResponse> | ResultResponse {
  if (status === 'completed') return buildCompletedResponse(supabase, executionId);
  if (status === 'failed') return buildErrorResponse(executionId);
  return buildRunningResponse(executionId);
}

export async function handleGetExecutionResult(req: Request, res: Response): Promise<void> {
  const { executionId }: ExecutionIdParams = req.params;

  if (typeof executionId !== 'string' || executionId === '') {
    res.status(HTTP_NOT_FOUND).json({ error: 'Missing executionId' });
    return;
  }

  try {
    const supabase = createServiceClient();
    const status = await fetchExecutionStatus(supabase, executionId);

    if (status === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Execution not found' });
      return;
    }

    const response = await resolveResponse(status, supabase, executionId);
    res.status(HTTP_OK).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(HTTP_INTERNAL).json({ error: message });
  }
}
