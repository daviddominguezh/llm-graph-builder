import type { Request, Response } from 'express';
import { z } from 'zod';

import { createServiceClient } from '../../db/queries/executionAuthQueries.js';
import { updateSessionState, updateToolOutputMessage } from '../../db/queries/executionQueries.js';
import { markResumeCompleted } from '../../db/queries/resumeQueries.js';
import { popStackEntry } from '../../db/queries/stackQueries.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;

const ResumeParentBodySchema = z.object({
  sessionId: z.string(),
  parentExecutionId: z.string(),
  parentToolOutputMessageId: z.string(),
  childOutput: z.string(),
  childStatus: z.enum(['success', 'error']),
  parentSessionState: z.record(z.string(), z.unknown()),
});

function log(msg: string): void {
  process.stdout.write(`[resume-parent] ${msg}\n`);
}

type ResumeParentData = z.infer<typeof ResumeParentBodySchema>;
type SupabaseClient = ReturnType<typeof createServiceClient>;

function parseStructuredOutputs(raw: unknown): Record<string, unknown[]> {
  const outputs: Record<string, unknown[]> = {};
  const source = raw !== null && typeof raw === 'object' ? raw : {};
  for (const [key, val] of Object.entries(source)) {
    outputs[key] = Array.isArray(val) ? val : [];
  }
  return outputs;
}

async function restoreParentState(supabase: SupabaseClient, data: ResumeParentData): Promise<void> {
  await updateToolOutputMessage(supabase, data.parentToolOutputMessageId, { text: data.childOutput });
  log('tool output message updated');

  const nodeId =
    typeof data.parentSessionState.currentNodeId === 'string' ? data.parentSessionState.currentNodeId : '';
  const outputs = parseStructuredOutputs(data.parentSessionState.structuredOutputs);
  await updateSessionState(supabase, data.sessionId, { currentNodeId: nodeId, structuredOutputs: outputs });
  log('session state restored');

  await popStackEntry(supabase, data.sessionId);
  log('stack entry popped');

  await markResumeCompleted(supabase, data.parentExecutionId);
  log('pending resume marked completed');
}

/**
 * POST /internal/resume-parent
 *
 * Resumes a parent agent execution after a child completes.
 * Idempotent: checks if the parent is already resumed before processing.
 */
export async function handleResumeParent(req: Request, res: Response): Promise<void> {
  const parsed = ResumeParentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    log(`validation failed: ${parsed.error.message}`);
    res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.message });
    return;
  }

  const { data } = parsed;
  log(`received parentExecution=${data.parentExecutionId} status=${data.childStatus}`);

  const supabase = createServiceClient();

  const { data: parentExec } = await supabase
    .from('agent_executions')
    .select('status')
    .eq('id', data.parentExecutionId)
    .maybeSingle();

  const parentStatus = (parentExec as Record<string, unknown> | null)?.status;
  if (parentStatus !== 'running') {
    log(`parent already resumed or completed: ${String(parentStatus)}`);
    res.status(HTTP_CONFLICT).json({ error: 'Parent not in running state' });
    return;
  }

  await restoreParentState(supabase, data);
  log(`parent resumed parentExecution=${data.parentExecutionId}`);
  res.status(HTTP_OK).json({ resumed: true, parentExecutionId: data.parentExecutionId });
}
