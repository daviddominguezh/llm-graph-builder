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
  const { sessionId, parentExecutionId, parentToolOutputMessageId, childOutput, childStatus, parentSessionState } =
    data;
  log(`received parentExecution=${parentExecutionId} status=${childStatus}`);

  const supabase = createServiceClient();

  // Idempotency: check if parent execution is still running (suspended)
  const { data: parentExec } = await supabase
    .from('agent_executions')
    .select('status')
    .eq('id', parentExecutionId)
    .maybeSingle();

  const parentStatus = (parentExec as Record<string, unknown> | null)?.status;
  if (parentStatus !== 'running') {
    log(`parent already resumed or completed: ${String(parentStatus)}`);
    res.status(HTTP_CONFLICT).json({ error: 'Parent not in running state' });
    return;
  }

  // 1. Update the parent's tool output message with the child's output
  await updateToolOutputMessage(supabase, parentToolOutputMessageId, { text: childOutput });
  log('tool output message updated');

  // 2. Restore parent session state
  const nodeId = typeof parentSessionState.currentNodeId === 'string' ? parentSessionState.currentNodeId : '';
  const { structuredOutputs: rawOutputs } = parentSessionState;
  const outputs: Record<string, unknown[]> = {};
  for (const [key, val] of Object.entries(rawOutputs !== null && typeof rawOutputs === 'object' ? rawOutputs : {})) {
    outputs[key] = Array.isArray(val) ? val : [];
  }
  await updateSessionState(supabase, sessionId, { currentNodeId: nodeId, structuredOutputs: outputs });
  log('session state restored');

  // 3. Pop the stack entry
  await popStackEntry(supabase, sessionId);
  log('stack entry popped');

  // 4. Mark the pending resume as completed
  await markResumeCompleted(supabase, parentExecutionId);
  log('pending resume marked completed');

  log(`parent resumed parentExecution=${parentExecutionId}`);
  res.status(HTTP_OK).json({ resumed: true, parentExecutionId });
}
