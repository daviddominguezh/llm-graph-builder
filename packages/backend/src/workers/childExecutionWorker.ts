import type { FinishSentinel } from '@daviddh/llm-graph-runner';

import {
  type PendingChildExecution,
  fetchAndClaimChildExecutions,
  getExecutionDetails,
  incrementChildAttempts,
  updateChildExecutionStatus,
} from '../db/queries/childExecutionQueries.js';
import { createServiceClient } from '../db/queries/executionAuthQueries.js';
import type { SupabaseClient } from '../db/queries/operationHelpers.js';
import { createPendingResume } from '../db/queries/resumeQueries.js';
import { getStackTop } from '../db/queries/stackQueries.js';
import type { ExecuteCoreInput, ExecuteCoreOutput } from '../routes/execute/executeCore.js';
import { executeAgentCore } from '../routes/execute/executeCore.js';
import type { OverrideAgentConfig } from '../routes/execute/executeFetcher.js';

const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 10;
const INCREMENT = 1;

function log(msg: string): void {
  process.stdout.write(`[childExecutionWorker] ${msg}\n`);
}

/* ─── Extract task from agent_config ─── */

function extractTask(config: Record<string, unknown>): string {
  const { task } = config;
  return typeof task === 'string' ? task : '';
}

/* ─── Extract dynamic child override config ─── */

function isDynamicChildConfig(config: Record<string, unknown>): boolean {
  return typeof config.systemPrompt === 'string';
}

function extractOverrideConfig(config: Record<string, unknown>): OverrideAgentConfig {
  const systemPrompt = typeof config.systemPrompt === 'string' ? config.systemPrompt : '';
  const context = typeof config.context === 'string' ? config.context : '';
  const maxSteps = typeof config.maxSteps === 'number' ? config.maxSteps : null;
  const modelId = typeof config.modelId === 'string' ? config.modelId : undefined;
  const isChildAgent = config.isChildAgent === true;
  return { systemPrompt, context, maxSteps, modelId, isChildAgent };
}

/* ─── Validate channel value ─── */

type Channel = 'whatsapp' | 'web' | 'instagram' | 'api';

const CHANNEL_MAP: Record<string, Channel> = {
  whatsapp: 'whatsapp',
  web: 'web',
  instagram: 'instagram',
  api: 'api',
};

function toChannel(value: string): Channel {
  return CHANNEL_MAP[value] ?? 'api';
}

/* ─── Build ExecuteCoreInput from child + execution details ─── */

async function buildCoreInput(
  supabase: SupabaseClient,
  child: PendingChildExecution
): Promise<ExecuteCoreInput> {
  const details = await getExecutionDetails(supabase, child.execution_id);
  const task = extractTask(child.agent_config);

  const base: ExecuteCoreInput = {
    supabase,
    orgId: child.org_id,
    agentId: details.agent_id,
    version: details.version,
    input: {
      tenantId: details.tenant_id,
      userId: details.external_user_id,
      sessionId: child.session_id,
      message: { text: task },
      channel: toChannel(details.channel),
      stream: false,
    },
  };

  // For dynamically created children (create_agent), the published agent is the parent.
  // Use the resolved config stored in the pending row instead of loading the parent's config.
  if (isDynamicChildConfig(child.agent_config)) {
    return { ...base, overrideAgentConfig: extractOverrideConfig(child.agent_config) };
  }

  return base;
}

/* ─── Create pending resume from a finish result ─── */

async function createResumeFromFinish(
  supabase: SupabaseClient,
  child: PendingChildExecution,
  finishResult: FinishSentinel
): Promise<void> {
  const stackEntry = await getStackTop(supabase, child.session_id);
  if (stackEntry === null) {
    throw new Error(`No stack entry found for session=${child.session_id}`);
  }

  await createPendingResume(supabase, {
    sessionId: child.session_id,
    parentExecutionId: child.parent_execution_id,
    parentToolOutputMessageId: stackEntry.parent_tool_output_message_id ?? '',
    childOutput: finishResult.output,
    childStatus: finishResult.status,
    parentSessionState: stackEntry.parent_session_state ?? {},
  });
}

/* ─── Handle the result from executeAgentCore ─── */

async function handleChildResult(
  supabase: SupabaseClient,
  child: PendingChildExecution,
  result: ExecuteCoreOutput
): Promise<void> {
  if (result.output?.finishResult !== undefined) {
    await createResumeFromFinish(supabase, child, result.output.finishResult);
    return;
  }

  if (result.output?.dispatchResult !== undefined) {
    return;
  }

  throw new Error('Child agent completed without calling finish');
}

/* ─── Process a single child execution ─── */

async function processOneChildExecution(
  supabase: SupabaseClient,
  child: PendingChildExecution
): Promise<void> {
  try {
    const coreInput = await buildCoreInput(supabase, child);
    const result = await executeAgentCore(coreInput);

    await handleChildResult(supabase, child, result);
    await updateChildExecutionStatus(supabase, child.id, 'completed');

    log(`completed execution=${child.execution_id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`error execution=${child.execution_id}: ${msg}`);

    await incrementChildAttempts(supabase, child.id, child.attempts);
    if (child.attempts + INCREMENT >= MAX_ATTEMPTS) {
      await updateChildExecutionStatus(supabase, child.id, 'failed');
      log(`max attempts reached execution=${child.execution_id}`);
    }
  }
}

/* ─── Poll and process pending child executions ─── */

async function processPendingChildExecutions(): Promise<void> {
  const supabase = createServiceClient();
  const EMPTY = 0;
  const children = await fetchAndClaimChildExecutions(supabase, BATCH_SIZE);
  if (children.length === EMPTY) return;

  log(`processing ${String(children.length)} pending child executions`);
  await Promise.all(
    children.map(async (child) => {
      await processOneChildExecution(supabase, child);
    })
  );
}

/**
 * Background worker that processes pending child executions.
 * Runs on a fixed interval, fetches pending child executions,
 * invokes executeAgentCore for each, and creates pending resumes
 * when children finish.
 */
export function startChildExecutionWorker(): void {
  log('Starting child execution worker');

  setInterval(() => {
    processPendingChildExecutions().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Error: ${msg}`);
    });
  }, POLL_INTERVAL_MS);
}

export { MAX_ATTEMPTS, BATCH_SIZE };
