/**
 * Test message processor.
 *
 * Handles messages from the built-in test console (no channel delivery).
 * Uses executeAgentCore for the unified execution pipeline.
 */
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { executeAgentCore } from '../../routes/execute/executeCore.js';
import { publishToTenant } from '../services/redis.js';
import { TEST_USER_CHANNEL_ID } from '../types/index.js';
import { resolveAgentForChannel } from './agentResolver.js';

/* ─── Publish to Redis ─── */

async function publishUpdate(tenantId: string, conversationId: string): Promise<void> {
  await publishToTenant(tenantId, { conversationId, tenantId }).catch(() => {
    process.stdout.write('[messaging] Redis publish failed (non-fatal)\n');
  });
}

/* ─── Invoke AI via executeAgentCore ─── */

interface InvokeTestAiParams {
  supabase: SupabaseClient;
  orgId: string;
  agentId: string;
  tenantId: string;
  content: string;
}

async function invokeAiAndPublish(params: InvokeTestAiParams): Promise<void> {
  try {
    const agent = await resolveAgentForChannel(params.supabase, { agent_id: params.agentId });

    const result = await executeAgentCore({
      supabase: params.supabase,
      orgId: agent.orgId,
      agentId: agent.agentId,
      version: agent.version,
      input: {
        tenantId: params.tenantId,
        userId: TEST_USER_CHANNEL_ID,
        sessionId: TEST_USER_CHANNEL_ID,
        channel: 'web',
        stream: false,
        message: { text: params.content },
      },
    });

    const responseText = result.output?.text ?? '';
    if (responseText === '') return;

    // No channel delivery needed for test console
    // executeAgentCore already persisted to messaging tables
    // Just publish a Redis update so the test UI refreshes
    await publishUpdate(params.tenantId, '');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stdout.write(`[messaging] AI invocation for test failed: ${msg}\n`);
  }
}

/* ─── Public API ─── */

interface ProcessTestParams {
  supabase: SupabaseClient;
  orgId: string;
  agentId: string;
  tenantId: string;
  content: string;
  type: string;
  clientMessageId?: string;
}

export function processTestMessage(params: ProcessTestParams): void {
  // Fire-and-forget: executeAgentCore handles all persistence
  void invokeAiAndPublish({
    supabase: params.supabase,
    orgId: params.orgId,
    agentId: params.agentId,
    tenantId: params.tenantId,
    content: params.content,
  });
}
