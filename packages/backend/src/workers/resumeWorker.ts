import { getNotifier } from '../notifications/notifierSingleton.js';
import { createServiceClient } from '../db/queries/executionAuthQueries.js';
import {
  type PendingResume,
  fetchAndClaimPendingResumes,
  incrementResumeAttempts,
  updateResumeStatus,
} from '../db/queries/resumeQueries.js';

const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 10;

function log(msg: string): void {
  process.stdout.write(`[resumeWorker] ${msg}\n`);
}

function getResumeUrl(): string {
  const port = process.env.PORT ?? '4000';
  return `http://127.0.0.1:${port}/internal/resume-parent`;
}

function getServiceKey(): string {
  return process.env.INTERNAL_SERVICE_KEY ?? '';
}

async function attemptResume(resume: PendingResume): Promise<boolean> {
  const url = getResumeUrl();
  const key = getServiceKey();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      sessionId: resume.session_id,
      parentExecutionId: resume.parent_execution_id,
      parentToolOutputMessageId: resume.parent_tool_output_message_id,
      childOutput: resume.child_output,
      childStatus: resume.child_status,
      parentSessionState: resume.parent_session_state,
      rootExecutionId: resume.root_execution_id,
    }),
  });

  return response.ok;
}

async function processOneResume(
  supabase: ReturnType<typeof createServiceClient>,
  resume: PendingResume
): Promise<void> {
  try {
    const success = await attemptResume(resume);
    if (success) {
      log(`completed parentExecution=${resume.parent_execution_id}`);
      return;
    }
    log(`failed parentExecution=${resume.parent_execution_id} attempt=${String(resume.attempts)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`error parentExecution=${resume.parent_execution_id}: ${msg}`);
  }

  const INCREMENT = 1;
  await updateResumeStatus(supabase, resume.id, 'pending');
  await incrementResumeAttempts(supabase, resume.id, resume.attempts);
  if (resume.attempts + INCREMENT >= MAX_ATTEMPTS) {
    await updateResumeStatus(supabase, resume.id, 'failed');
    log(`max attempts reached parentExecution=${resume.parent_execution_id}`);
    // Notify root that the chain has permanently failed
    try {
      const notifier = getNotifier();
      await notifier.notifyCompletion(resume.root_execution_id, {
        status: 'error',
        text: `Parent resume failed after ${String(MAX_ATTEMPTS)} attempts`,
        executionId: resume.root_execution_id,
      });
    } catch (notifyErr: unknown) {
      log(`notify error: ${String(notifyErr)}`);
    }
  }
}

async function processPendingResumes(): Promise<void> {
  const supabase = createServiceClient();
  const EMPTY = 0;
  const resumes = await fetchAndClaimPendingResumes(supabase, BATCH_SIZE);
  if (resumes.length === EMPTY) return;

  log(`processing ${String(resumes.length)} pending resumes`);
  await Promise.all(
    resumes.map(async (resume) => {
      await processOneResume(supabase, resume);
    })
  );
}

/**
 * Background worker that processes pending resumes.
 * Runs on a fixed interval, fetches pending resumes, and attempts
 * to resume parent executions via POST /internal/resume-parent.
 */
export function startResumeWorker(): void {
  log('Starting resume worker');

  async function pollLoop(): Promise<void> {
    try {
      await processPendingResumes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Error: ${msg}`);
    } finally {
      setTimeout(scheduleNextPoll, POLL_INTERVAL_MS);
    }
  }

  function scheduleNextPoll(): void {
    pollLoop().catch((err: unknown) => {
      log(`Unhandled poll error: ${String(err)}`);
    });
  }

  scheduleNextPoll();
}

export { MAX_ATTEMPTS, BATCH_SIZE };
