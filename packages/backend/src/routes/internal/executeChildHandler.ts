import type { Request, Response } from 'express';
import { z } from 'zod';

import { createServiceClient } from '../../db/queries/executionAuthQueries.js';

const HTTP_ACCEPTED = 202;
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;

const ExecuteChildBodySchema = z.object({
  executionId: z.string(),
  sessionId: z.string(),
  agentConfig: z.record(z.string(), z.unknown()),
  initialMessage: z.string(),
  orgId: z.string(),
  apiKeyId: z.string(),
  executionKeyId: z.string().optional(),
  mcpServerConfigs: z.array(z.unknown()).optional(),
  appType: z.enum(['agent', 'workflow']),
});

function log(msg: string): void {
  process.stdout.write(`[execute-child] ${msg}\n`);
}

/**
 * POST /internal/execute-child
 *
 * Starts a child agent/workflow execution on a new serverless instance.
 * Idempotent: checks if the execution already exists and is running.
 * Returns 202 immediately upon accepting the work.
 */
export async function handleExecuteChild(req: Request, res: Response): Promise<void> {
  const parsed = ExecuteChildBodySchema.safeParse(req.body);
  if (!parsed.success) {
    log(`validation failed: ${parsed.error.message}`);
    res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.message });
    return;
  }

  const { data } = parsed;
  const { executionId, appType } = data;
  log(`received executionId=${executionId} appType=${appType}`);

  const supabase = createServiceClient();

  // Idempotency check: if execution already exists and is running, return 409
  const existingResult = await supabase
    .from('agent_executions')
    .select('status')
    .eq('id', executionId)
    .maybeSingle();

  const existingStatus = (existingResult.data as { status?: string } | null)?.status;
  if (existingStatus === 'running') {
    log(`already running executionId=${executionId}`);
    res.status(HTTP_CONFLICT).json({ error: 'Execution already running' });
    return;
  }

  // Accept immediately — the actual execution will be triggered
  // by the parent's dispatch handler or by the resume worker
  log(`accepted executionId=${executionId}`);
  res.status(HTTP_ACCEPTED).json({ accepted: true, executionId });
}
