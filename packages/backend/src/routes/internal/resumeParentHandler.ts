import type { CallAgentOutput } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { createServiceClient } from '../../db/queries/executionAuthQueries.js';
import { updateSessionState, updateToolOutputMessage } from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import {
  type PendingResume,
  claimPendingResume,
  markResumeCompleted,
} from '../../db/queries/resumeQueries.js';
import { popStackEntry } from '../../db/queries/stackQueries.js';
import { getNotifier } from '../../notifications/notifierSingleton.js';
import { executeAgentCore } from '../execute/executeCore.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL = 500;

const ResumeParentBodySchema = z.object({
  sessionId: z.string(),
  parentExecutionId: z.string(),
  parentToolOutputMessageId: z.string(),
  childOutput: z.string(),
  childStatus: z.enum(['success', 'error']),
  parentSessionState: z.record(z.string(), z.unknown()),
  rootExecutionId: z.string(),
});

function log(msg: string): void {
  process.stdout.write(`[resume-parent] ${msg}\n`);
}

type ResumeParentData = z.infer<typeof ResumeParentBodySchema>;

/* ─── Parent execution record shape ─── */

interface ParentExecutionRow {
  agent_id: string;
  org_id: string;
  version: number;
  channel: string;
  tenant_id: string;
  external_user_id: string;
  model: string;
  session_id: string;
}

type Channel = 'whatsapp' | 'web' | 'instagram' | 'api';

const CHANNEL_MAP: Record<string, Channel> = {
  whatsapp: 'whatsapp',
  web: 'web',
  instagram: 'instagram',
  api: 'api',
};

function toChannel(value: string): Channel {
  return CHANNEL_MAP[value] ?? 'web';
}

/* ─── Helpers ─── */

function extractToolMeta(sessionState: Record<string, unknown>): { toolCallId: string; toolName: string } {
  const toolCallId = typeof sessionState.toolCallId === 'string' ? sessionState.toolCallId : '';
  const toolName = typeof sessionState.toolName === 'string' ? sessionState.toolName : '';
  return { toolCallId, toolName };
}

function buildToolResultContent(
  toolCallId: string,
  toolName: string,
  childOutput: string
): Record<string, unknown> {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId,
        toolName,
        output: { type: 'text', value: childOutput },
      },
    ],
  };
}

function parseStructuredOutputs(raw: unknown): Record<string, unknown[]> {
  const outputs: Record<string, unknown[]> = {};
  const source = raw !== null && typeof raw === 'object' ? raw : {};
  for (const [key, val] of Object.entries(source)) {
    outputs[key] = Array.isArray(val) ? val : [];
  }
  return outputs;
}

async function fetchParentExecution(
  supabase: SupabaseClient,
  executionId: string
): Promise<ParentExecutionRow> {
  const result = await supabase
    .from('agent_executions')
    .select('agent_id, org_id, version, channel, tenant_id, external_user_id, model, session_id')
    .eq('id', executionId)
    .single();

  if (result.error !== null) {
    throw new Error(`Failed to fetch parent execution: ${result.error.message}`);
  }
  return result.data as ParentExecutionRow;
}

/* ─── Restore parent state ─── */

async function updateToolOutput(
  supabase: SupabaseClient,
  claimed: PendingResume,
  data: ResumeParentData
): Promise<void> {
  const { toolCallId, toolName } = extractToolMeta(claimed.parent_session_state);
  const content = buildToolResultContent(toolCallId, toolName, data.childOutput);
  await updateToolOutputMessage(supabase, claimed.parent_tool_output_message_id, content);
  log('tool output message updated with AI SDK format');
}

async function restoreSessionState(supabase: SupabaseClient, data: ResumeParentData): Promise<void> {
  const nodeId =
    typeof data.parentSessionState.currentNodeId === 'string' ? data.parentSessionState.currentNodeId : '';
  const outputs = parseStructuredOutputs(data.parentSessionState.structuredOutputs);
  await updateSessionState(supabase, data.sessionId, { currentNodeId: nodeId, structuredOutputs: outputs });
  log('session state restored');
}

async function popAndMarkComplete(supabase: SupabaseClient, data: ResumeParentData): Promise<void> {
  const popped = await popStackEntry(supabase, data.sessionId);
  if (popped === null) {
    log('warning: stack already popped');
  } else {
    log('stack entry popped');
  }
  await markResumeCompleted(supabase, data.parentExecutionId);
  log('pending resume marked completed');
}

/* ─── Re-invoke parent execution ─── */

async function reinvokeParent(
  supabase: SupabaseClient,
  parentExec: ParentExecutionRow,
  data: ResumeParentData
): Promise<CallAgentOutput | null> {
  const result = await executeAgentCore({
    supabase,
    orgId: parentExec.org_id,
    agentId: parentExec.agent_id,
    version: parentExec.version,
    input: {
      tenantId: parentExec.tenant_id,
      userId: parentExec.external_user_id,
      sessionId: data.sessionId,
      message: { text: '' },
      channel: toChannel(parentExec.channel),
      stream: false,
    },
    continueExecutionId: data.parentExecutionId,
    rootExecutionId: data.rootExecutionId,
  });
  log(`parent re-invoked executionId=${data.parentExecutionId}`);
  return result.output;
}

/* ─── Completion notification ─── */

async function notifyIfChainComplete(output: CallAgentOutput | null, rootExecutionId: string): Promise<void> {
  if (output === null || output.dispatchResult !== undefined) return;
  try {
    const notifier = getNotifier();
    await notifier.notifyCompletion(rootExecutionId, {
      status: 'completed',
      text: output.text ?? '',
      executionId: rootExecutionId,
    });
  } catch (notifyErr: unknown) {
    log(`notify error: ${String(notifyErr)}`);
  }
}

/* ─── Resume execution core ─── */

async function resumeExecution(
  supabase: SupabaseClient,
  claimed: PendingResume,
  data: ResumeParentData
): Promise<void> {
  const parentExec = await fetchParentExecution(supabase, data.parentExecutionId);
  await updateToolOutput(supabase, claimed, data);
  await restoreSessionState(supabase, data);
  await popAndMarkComplete(supabase, data);
  const output = await reinvokeParent(supabase, parentExec, data);
  log(`parent resumed parentExecution=${data.parentExecutionId} output=${JSON.stringify(output)}`);
  await notifyIfChainComplete(output, data.rootExecutionId);
}

/**
 * POST /internal/resume-parent
 *
 * Resumes a parent agent execution after a child completes.
 * Uses atomic claim to prevent duplicate processing.
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

  const claimed = await claimPendingResume(supabase, data.parentExecutionId);
  if (claimed === null) {
    log('resume already claimed by another process');
    res.status(HTTP_CONFLICT).json({ error: 'Resume already claimed' });
    return;
  }

  try {
    await resumeExecution(supabase, claimed, data);
    res.status(HTTP_OK).json({ resumed: true, parentExecutionId: data.parentExecutionId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log(`error resuming parent: ${message}`);
    res.status(HTTP_INTERNAL).json({ error: message });
  }
}
