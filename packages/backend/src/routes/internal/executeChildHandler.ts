import type { Request, Response } from 'express';

/**
 * POST /internal/execute-child
 *
 * Starts a child agent/workflow execution on a new serverless instance.
 * Idempotent: checks if the execution already exists before starting.
 *
 * Returns 202 immediately upon accepting the work (before executing).
 * The actual execution happens asynchronously after the response.
 */
export async function handleExecuteChild(req: Request, res: Response): Promise<void> {
  // TODO: Implement child execution startup
  // 1. Extract executionId, agentConfig, initialMessage, orgId, apiKeyId from body
  // 2. Check if execution already exists (idempotency)
  // 3. Accept the work immediately (return 202)
  // 4. Execute asynchronously (after response)
  process.stderr.write(`[internal] execute-child called\n`);
  res.status(202).json({ accepted: true });
}
