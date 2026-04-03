const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 10;

/**
 * Background worker that processes pending resumes.
 * Runs on a fixed interval, claims pending resumes, and attempts
 * to resume parent executions via POST /internal/resume-parent.
 */
export function startResumeWorker(): void {
  process.stderr.write('[resumeWorker] Starting resume worker\n');

  setInterval(() => {
    processPendingResumes().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[resumeWorker] Error: ${msg}\n`);
    });
  }, POLL_INTERVAL_MS);
}

async function processPendingResumes(): Promise<void> {
  // TODO: Implement resume processing
  // 1. Get supabase client
  // 2. Call fetchPendingResumes(supabase, BATCH_SIZE)
  // 3. For each: POST to /internal/resume-parent
  // 4. On success: call markResumeCompleted
  // 5. On failure: call incrementResumeAttempts
  // 6. If attempts >= MAX_ATTEMPTS: call updateResumeStatus(id, 'failed')
}

export { MAX_ATTEMPTS, BATCH_SIZE };
