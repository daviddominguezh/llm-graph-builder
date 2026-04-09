/**
 * Wraps dispatch tools for simulation workflows so children execute
 * in-process instead of returning sentinels. From the workflow executor's
 * perspective, the tool call just takes longer but returns real output.
 */
import { executeAgentLoop, injectSystemTools } from '@daviddh/llm-graph-runner';
import type { Tool } from 'ai';

import type { SupabaseClient } from '../db/queries/operationHelpers.js';
import { type McpSession, closeMcpSession, createMcpSession } from '../mcp/lifecycle.js';
import { type ResolvedChildConfig, resolveChildConfig } from './simulateChildResolver.js';
import { buildUserMessage } from './simulationOrchestratorHelpers.js';

function noopCallback(): void {
  /* intentional no-op for child agent step processing */
}

const DISPATCH_TOOL_NAMES = new Set(['create_agent', 'invoke_agent', 'invoke_workflow']);

interface WrapContext {
  supabase: SupabaseClient;
  orgId: string;
  parentApiKey: string;
  parentModelId: string;
  parentSession: McpSession;
}

function dispatchTypeFromToolName(name: string): 'create_agent' | 'invoke_agent' | 'invoke_workflow' {
  if (name === 'create_agent') return 'create_agent';
  if (name === 'invoke_workflow') return 'invoke_workflow';
  return 'invoke_agent';
}

async function executeChild(childConfig: ResolvedChildConfig, ctx: WrapContext): Promise<string> {
  const childSession = await createMcpSession(childConfig.mcpServers);
  try {
    const tools = injectSystemTools({
      existingTools: { ...ctx.parentSession.tools, ...childSession.tools },
      isChildAgent: childConfig.isChildAgent,
    });
    const result = await executeAgentLoop(
      {
        systemPrompt: childConfig.systemPrompt,
        context: childConfig.context,
        messages: [buildUserMessage(childConfig.task)],
        apiKey: ctx.parentApiKey,
        modelId: childConfig.modelId === '' ? ctx.parentModelId : childConfig.modelId,
        maxSteps: childConfig.maxSteps,
        tools,
        isChildAgent: childConfig.isChildAgent,
      },
      { onStepProcessed: noopCallback }
    );
    return result.finishResult?.output ?? result.finalText;
  } finally {
    await closeMcpSession(childSession);
  }
}

function wrapSingleTool(name: string, original: Tool, ctx: WrapContext): Tool {
  const dispatchType = dispatchTypeFromToolName(name);
  return {
    ...original,
    execute: async (args: Record<string, unknown>): Promise<string> => {
      const childConfig = await resolveChildConfig({
        supabase: ctx.supabase,
        dispatchType,
        params: args,
        orgId: ctx.orgId,
      });
      return await executeChild(childConfig, ctx);
    },
  };
}

/**
 * Takes a tool set (with dispatch tools already injected) and wraps the
 * dispatch tools so they execute children in-process for simulation.
 * Non-dispatch tools are left unchanged.
 */
export function wrapDispatchToolsForSimulation(
  tools: Record<string, Tool>,
  ctx: WrapContext
): Record<string, Tool> {
  const wrapped: Record<string, Tool> = {};
  for (const [name, tool] of Object.entries(tools)) {
    wrapped[name] = DISPATCH_TOOL_NAMES.has(name) ? wrapSingleTool(name, tool, ctx) : tool;
  }
  return wrapped;
}
