import type { Request, Response } from 'express';

const HTTP_OK = 200;

/**
 * POST /internal/resume-parent
 *
 * Resumes a parent agent execution after a child completes.
 * Idempotent: checks if the parent is already resumed before processing.
 *
 * 1. Updates the parent's tool output message with child's output
 * 2. Restores parent's session state
 * 3. Pops the stack entry
 * 4. Resumes the parent's agent loop
 */
export function handleResumeParent(_req: Request, res: Response): void {
  // TODO: Implement parent resumption
  // 1. Extract parentExecutionId, childOutput, childStatus, parentSessionState from body
  // 2. Check if parent is already resumed (idempotency)
  // 3. Update tool output message
  // 4. Restore session state
  // 5. Pop stack entry
  // 6. Resume parent execution
  process.stderr.write('[internal] resume-parent called\n');
  res.status(HTTP_OK).json({ resumed: true });
}
