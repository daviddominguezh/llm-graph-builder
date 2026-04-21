import type { AgentLoopCallbacks, AgentLoopConfig, AgentLoopResult } from '@daviddh/llm-graph-runner';
import { executeAgentLoop, injectSystemTools } from '@daviddh/llm-graph-runner';

import { consoleLogger } from '../logger.js';
import { closeMcpSession, createMcpSession } from '../mcp/lifecycle.js';
import { resolveChildConfig } from './simulateChildResolver.js';
import {
  buildChildOrchestratorConfig,
  buildToolResultMessage,
  checkDepthLimit,
  extractDispatchType,
  extractTask,
  findDispatchToolCall,
} from './simulationOrchestratorHelpers.js';
import type {
  DispatchType,
  OrchestratorCallbacks,
  OrchestratorConfig,
  OrchestratorResult,
} from './simulationOrchestratorTypes.js';

const INCREMENT = 1;
const ZERO = 0;
const ZERO_TOKENS = { input: ZERO, output: ZERO, cached: ZERO };

/* ─── AgentLoop config/callback builders ─── */

function buildLoopConfig(config: OrchestratorConfig): AgentLoopConfig {
  const isChild = config.depth > ZERO;
  const tools = injectSystemTools({ existingTools: config.session.tools, isChildAgent: isChild });

  return {
    systemPrompt: config.body.systemPrompt,
    context: config.body.context,
    messages: config.body.messages,
    apiKey: config.body.apiKey,
    modelId: config.body.modelId,
    maxSteps: config.body.maxSteps,
    tools,
    skills: config.body.skills,
    isChildAgent: isChild,
  };
}

function buildLoopCallbacks(
  config: OrchestratorConfig,
  callbacks: OrchestratorCallbacks
): AgentLoopCallbacks {
  return {
    onStepStarted: (step: number) => {
      callbacks.onStepStarted(step, config.depth);
    },
    onStepProcessed: (event) => {
      callbacks.onStepProcessed(event, config.depth);
    },
    onToolExecuted: (event) => {
      callbacks.onToolExecuted(event, config.depth);
    },
  };
}

/* ─── Result wrappers ─── */

function completedResult(result: AgentLoopResult): OrchestratorResult {
  return { type: 'completed', result };
}

function childWaitingResult(depth: number, text: string): OrchestratorResult {
  return { type: 'child_waiting', depth, text };
}

/* ─── Inject child output and re-run parent ─── */

interface ContinueParentParams {
  config: OrchestratorConfig;
  callbacks: OrchestratorCallbacks;
  parentToolCallId: string;
  toolName: string;
}

async function rerunParentWithToolResult(params: ContinueParentParams): Promise<OrchestratorResult> {
  const { config, callbacks } = params;
  const loopConfig = buildLoopConfig(config);
  const loopCallbacks = buildLoopCallbacks(config, callbacks);
  const parentResult = await executeAgentLoop(loopConfig, loopCallbacks, consoleLogger);

  if (parentResult.dispatchResult !== undefined) {
    return await handleDispatch(config, callbacks, parentResult);
  }
  return completedResult(parentResult);
}

async function continueParentAfterChild(
  params: ContinueParentParams,
  childResult: AgentLoopResult
): Promise<OrchestratorResult> {
  const output = childResult.finishResult?.output ?? childResult.finalText;
  const status = childResult.finishResult?.status ?? 'success';
  const childDepth = params.config.depth + INCREMENT;
  params.callbacks.onChildFinished({ depth: childDepth, output, status, tokens: childResult.totalTokens });

  const toolResultMsg = buildToolResultMessage(params.parentToolCallId, params.toolName, output);
  params.config.body.messages.push(toolResultMsg);

  return await rerunParentWithToolResult(params);
}

async function continueParentAfterError(
  params: ContinueParentParams,
  error: Error
): Promise<OrchestratorResult> {
  const childDepth = params.config.depth + INCREMENT;
  params.callbacks.onChildFinished({
    depth: childDepth,
    output: error.message,
    status: 'error',
    tokens: ZERO_TOKENS,
  });

  const toolResultMsg = buildToolResultMessage(
    params.parentToolCallId,
    params.toolName,
    `Error: ${error.message}`
  );
  params.config.body.messages.push(toolResultMsg);

  return await rerunParentWithToolResult(params);
}

/* ─── Process child outcome ─── */

function isChildWaiting(childOutcome: OrchestratorResult): boolean {
  return childOutcome.type === 'child_waiting';
}

async function processChildOutcome(
  continueParams: ContinueParentParams,
  childOutcome: OrchestratorResult
): Promise<OrchestratorResult> {
  if (isChildWaiting(childOutcome)) return childOutcome;

  if (childOutcome.type === 'completed' && childOutcome.result.finishResult !== undefined) {
    return await continueParentAfterChild(continueParams, childOutcome.result);
  }

  // Child completed without finish sentinel — it needs user input
  if (childOutcome.type === 'completed') {
    const childDepth = continueParams.config.depth + INCREMENT;
    continueParams.callbacks.onChildWaiting(childDepth, childOutcome.result.finalText);
    return childWaitingResult(childDepth, childOutcome.result.finalText);
  }

  return childOutcome;
}

/* ─── Run child agent recursively ─── */

interface DispatchContext {
  config: OrchestratorConfig;
  callbacks: OrchestratorCallbacks;
  result: AgentLoopResult;
  parentToolCallId: string;
  toolName: string;
}

function notifyChildDispatched(ctx: DispatchContext, dispatchType: DispatchType, task: string): void {
  const childDepth = ctx.config.depth + INCREMENT;
  ctx.callbacks.onChildDispatched({
    depth: childDepth,
    parentDepth: ctx.config.depth,
    dispatchType,
    task,
    parentToolCallId: ctx.parentToolCallId,
    toolName: ctx.toolName,
  });
}

async function runChild(ctx: DispatchContext): Promise<OrchestratorResult> {
  const { result } = ctx;
  const { dispatchResult } = result;
  if (dispatchResult === undefined) return completedResult(result);

  const dispatchType = extractDispatchType(dispatchResult);
  const task = extractTask(dispatchType, dispatchResult.params);
  notifyChildDispatched(ctx, dispatchType, task);

  const childConfig = await resolveChildConfig({
    supabase: ctx.config.supabase,
    dispatchType: dispatchResult.type,
    params: dispatchResult.params,
    orgId: ctx.config.orgId,
  });

  const childSession = await createMcpSession(childConfig.mcpServers);
  try {
    const childOrcConfig = buildChildOrchestratorConfig({
      parentConfig: ctx.config,
      childConfig,
      childSession,
    });
    const childOutcome = await runSimulationOrchestration(childOrcConfig, ctx.callbacks);
    const continueParams: ContinueParentParams = {
      config: ctx.config,
      callbacks: ctx.callbacks,
      parentToolCallId: ctx.parentToolCallId,
      toolName: ctx.toolName,
    };
    return await processChildOutcome(continueParams, childOutcome);
  } finally {
    await closeMcpSession(childSession);
  }
}

/* ─── Handle dispatch sentinel ─── */

function buildDispatchContext(
  config: OrchestratorConfig,
  callbacks: OrchestratorCallbacks,
  result: AgentLoopResult,
  info: { toolCallId: string; toolName: string }
): DispatchContext {
  return {
    config,
    callbacks,
    result,
    parentToolCallId: info.toolCallId,
    toolName: info.toolName,
  };
}

async function handleDispatch(
  config: OrchestratorConfig,
  callbacks: OrchestratorCallbacks,
  result: AgentLoopResult
): Promise<OrchestratorResult> {
  const depthError = checkDepthLimit(config.depth, config.maxNestingDepth);
  if (depthError !== null) {
    return completedResult({ ...result, finalText: depthError });
  }

  const dispatchInfo = findDispatchToolCall(result.toolCalls);
  if (dispatchInfo === null) return completedResult(result);

  const ctx = buildDispatchContext(config, callbacks, result, dispatchInfo);

  try {
    return await runChild(ctx);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const continueParams: ContinueParentParams = {
      config,
      callbacks,
      parentToolCallId: dispatchInfo.toolCallId,
      toolName: dispatchInfo.toolName,
    };
    return await continueParentAfterError(continueParams, error);
  }
}

/* ─── Main entry point ─── */

export async function runSimulationOrchestration(
  config: OrchestratorConfig,
  callbacks: OrchestratorCallbacks
): Promise<OrchestratorResult> {
  const loopConfig = buildLoopConfig(config);
  const loopCallbacks = buildLoopCallbacks(config, callbacks);
  const result = await executeAgentLoop(loopConfig, loopCallbacks, consoleLogger);

  if (result.dispatchResult !== undefined) {
    return await handleDispatch(config, callbacks, result);
  }

  return completedResult(result);
}
