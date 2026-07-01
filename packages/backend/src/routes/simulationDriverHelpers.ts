import type {
  AgentLoopResult,
  CallAgentOutput,
  ChildResult,
  ExecutionEvent,
  ExecutionType,
  FinishSentinel,
  McpInvoker,
  ResolveChildInput,
  ResolvedChildConfig,
  RuntimeServices,
  SimStateStore,
  SupabaseLike,
} from '@daviddh/llm-graph-runner';
import {
  createEventEmitter,
  executeAgentLoop,
  executeTurn,
  makeResolveChildConfig,
  selectStepMachine,
} from '@daviddh/llm-graph-runner';
import type { Response } from 'express';

import { createServiceClient } from '../db/queries/executionAuthQueries.js';
import { consoleLogger } from '../logger.js';
import type { AgentSimEvent, WorkflowSimEvent } from '../runtime/executionEventBridge.js';
import { executionEventToSim } from '../runtime/executionEventBridge.js';
import { buildSimulationCapabilities, buildSimulationRuntimeServices } from '../runtime/simulationCapabilities.js';
import type { SimulateRequest } from '../types.js';
import {
  sendAgentResponse,
  sendChildDispatched,
  sendStepProcessed,
  sendStepStarted,
  sendToolExecuted,
} from './simulateAgentSse.js';
import type { SimulateAgentRequest } from './simulateAgentTypes.js';
import { findDispatchToolCallId, runWorkflowStep, sendWorkflowAgentResponse } from './simulateHandler.js';
import { resolveChildConfig } from './simulateChildResolver.js';
import { buildLoopCallbacks, buildLoopConfig } from './simulationOrchestrator.js';
import type { DispatchToolCallInfo } from './simulationOrchestratorHelpers.js';
import {
  buildChildOrchestratorConfig,
  buildToolResultMessage,
  extractDispatchType,
  extractTask,
  findDispatchToolCall,
} from './simulationOrchestratorHelpers.js';
import type { OrchestratorCallbacks, OrchestratorConfig } from './simulationOrchestratorTypes.js';

const ROOT_DEPTH = 0;
const ONE_LEVEL = 1;
const MAX_DISPATCH_DEPTH_SIM = 10;

/** Constant, sim-wide services threaded through the whole recursive turn tree. */
export interface TurnCtx {
  res: Response;
  services: RuntimeServices;
  simStore: SimStateStore;
}

interface ChildTermination {
  finishResult?: FinishSentinel;
  lastAssistantText: string;
}

interface AgentTurnResult {
  finalText: string;
  lastResult: AgentLoopResult | undefined;
}

/* ─── Services (HARD DEP #3b: real orgId, never '') ─── */

function mcpPoolStub(): McpInvoker {
  return {
    // The sim engine builds its own MCP tools inside the closures; the
    // executeTurn driver never touches services.mcpPool.
    invoke: async (): Promise<never> => {
      await Promise.resolve();
      throw new Error('mcpPool is not used on the simulation driver path');
    },
  };
}

export function buildSimServices(supabase: SupabaseLike, orgId: string): RuntimeServices {
  const base = buildSimulationRuntimeServices(supabase, mcpPoolStub());
  const resolve = makeResolveChildConfig(
    supabase,
    async (_sb: SupabaseLike, input: ResolveChildInput): Promise<ResolvedChildConfig> =>
      await resolveChildConfig({
        supabase: createServiceClient(),
        dispatchType: input.dispatchType,
        params: input.params,
        orgId,
      })
  );
  return { ...base, resolveChildConfig: resolve };
}

/* ─── Bridged-event writers (two SSE paths, HARD DEP #1) ─── */

function writeBridged(res: Response, event: AgentSimEvent | WorkflowSimEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function writeSimEvent(res: Response, ev: ExecutionEvent, executionType: ExecutionType): void {
  const mapped = executionEventToSim(ev, executionType);
  if (mapped !== null) writeBridged(res, mapped);
}

function writeComplete(res: Response): void {
  writeBridged(res, { type: 'simulation_complete' });
}

function shouldForward(ev: ExecutionEvent, isRoot: boolean): boolean {
  // `finished` is never forwarded: the root emits `simulation_complete` AFTER the
  // final agent_response so ordering matches the legacy stream. Child turns also
  // suppress their own snapshot (only the top-level snapshot is meaningful).
  if (ev.type === 'finished') return false;
  if (!isRoot && ev.type === 'simulation_state_snapshot') return false;
  return true;
}

async function forwardEvents(
  ctx: TurnCtx,
  events: AsyncIterable<ExecutionEvent>,
  executionType: ExecutionType,
  isRoot: boolean
): Promise<void> {
  for await (const ev of events) {
    if (shouldForward(ev, isRoot)) writeSimEvent(ctx.res, ev, executionType);
  }
}

function childResultText(child: ChildResult): string {
  if (child.status === 'finished') return child.result;
  if (child.status === 'awaiting_input') return child.partial;
  return child.message;
}

/* ─── Agent engine ─── */

function agentContentCallbacks(res: Response): OrchestratorCallbacks {
  return {
    onStepStarted: (step, depth) => {
      sendStepStarted(res, step, depth);
    },
    onStepProcessed: (event, depth) => {
      sendStepProcessed(res, event, depth);
    },
    onToolExecuted: (event, depth) => {
      sendToolExecuted(res, event, depth);
    },
    onChildDispatched: () => undefined,
    onChildFinished: () => undefined,
    onChildWaiting: () => undefined,
  };
}

/** Emit the rich `child_dispatched` (content path) and return the parent tool call. */
function announceAgentDispatch(
  res: Response,
  config: OrchestratorConfig,
  result: AgentLoopResult
): DispatchToolCallInfo | undefined {
  if (result.dispatchResult === undefined) return undefined;
  const info = findDispatchToolCall(result.toolCalls);
  if (info === null) return undefined;
  const dispatchType = extractDispatchType(result.dispatchResult);
  sendChildDispatched(res, {
    depth: config.depth + ONE_LEVEL,
    parentDepth: config.depth,
    dispatchType,
    task: extractTask(dispatchType, result.dispatchResult.params),
    parentToolCallId: info.toolCallId,
    toolName: info.toolName,
  });
  return info;
}

async function runAgentChild(
  ctx: TurnCtx,
  parentConfig: OrchestratorConfig,
  childConfig: ResolvedChildConfig
): Promise<ChildTermination> {
  const config = buildChildOrchestratorConfig({ parentConfig, childConfig });
  const turn = await driveAgentTurn(ctx, config, false);
  return { finishResult: turn.lastResult?.finishResult, lastAssistantText: turn.finalText };
}

async function driveAgentTurn(
  ctx: TurnCtx,
  config: OrchestratorConfig,
  isRoot: boolean
): Promise<AgentTurnResult> {
  const emitter = createEventEmitter();
  const callbacks = agentContentCallbacks(ctx.res);
  let lastResult: AgentLoopResult | undefined = undefined;
  let pending: DispatchToolCallInfo | undefined = undefined;
  const machine = selectStepMachine('agent', {
    emitter,
    runAgentLoop: async () => {
      const loopConfig = await buildLoopConfig(config);
      const result = await executeAgentLoop(loopConfig, buildLoopCallbacks(config, callbacks), consoleLogger);
      lastResult = result;
      pending = announceAgentDispatch(ctx.res, config, result);
      return result;
    },
    onChildResult: (child) => {
      if (pending === undefined) return;
      const msg = buildToolResultMessage(pending.toolCallId, pending.toolName, childResultText(child));
      config.body.messages.push(msg);
      pending = undefined;
    },
  });
  const output = await executeTurn({
    environment: 'simulation',
    executionType: 'agent',
    dispatchDepth: config.depth,
    maxDispatchDepth: MAX_DISPATCH_DEPTH_SIM,
    capabilities: buildSimulationCapabilities(),
    services: ctx.services,
    simStore: ctx.simStore,
    emitter,
    machine,
    runChildToTermination: async (child) => await runAgentChild(ctx, config, child),
  });
  await forwardEvents(ctx, output.events, 'agent', isRoot);
  return { finalText: output.finalResult, lastResult };
}

/* ─── Workflow engine (children run as agent turns, matching legacy sim) ─── */

function synthParentConfig(body: SimulateRequest, orgId: string): OrchestratorConfig {
  const agentBody: SimulateAgentRequest = {
    appType: 'agent',
    systemPrompt: '',
    context: '',
    messages: [],
    apiKey: body.apiKey,
    modelId: body.modelId,
    maxSteps: null,
    mcpServers: body.graph.mcpServers ?? [],
    orgId,
    tenantId: body.tenantID,
  };
  return {
    body: agentBody,
    depth: ROOT_DEPTH,
    maxNestingDepth: MAX_DISPATCH_DEPTH_SIM,
    orgId,
    supabase: createServiceClient(),
  };
}

function injectWorkflowChild(body: SimulateRequest, out: CallAgentOutput | null, child: ChildResult): void {
  if (out?.dispatchResult === undefined) return;
  const id = findDispatchToolCallId(out, out.dispatchResult.type);
  body.messages.push(buildToolResultMessage(id, out.dispatchResult.type, childResultText(child)));
}

async function driveWorkflowTurn(
  ctx: TurnCtx,
  body: SimulateRequest,
  orgId: string,
  isRoot: boolean
): Promise<CallAgentOutput | null> {
  const emitter = createEventEmitter();
  let lastOutput: CallAgentOutput | null = null;
  const machine = selectStepMachine('workflow', {
    emitter,
    runWorkflow: async () => {
      const out = await runWorkflowStep(ctx.res, body);
      lastOutput = out;
      return out;
    },
    onChildResult: (child) => {
      injectWorkflowChild(body, lastOutput, child);
    },
  });
  const output = await executeTurn({
    environment: 'simulation',
    executionType: 'workflow',
    dispatchDepth: ROOT_DEPTH,
    maxDispatchDepth: MAX_DISPATCH_DEPTH_SIM,
    capabilities: buildSimulationCapabilities(),
    services: ctx.services,
    simStore: ctx.simStore,
    emitter,
    machine,
    runChildToTermination: async (child) => await runAgentChild(ctx, synthParentConfig(body, orgId), child),
  });
  await forwardEvents(ctx, output.events, 'workflow', isRoot);
  return lastOutput;
}

/* ─── Root entry points (used by the unified handler) ─── */

export async function driveAgentRoot(ctx: TurnCtx, config: OrchestratorConfig): Promise<void> {
  const { lastResult } = await driveAgentTurn(ctx, config, true);
  if (lastResult !== undefined) sendAgentResponse(ctx.res, lastResult);
  writeComplete(ctx.res);
}

export async function driveWorkflowRoot(ctx: TurnCtx, body: SimulateRequest, orgId: string): Promise<void> {
  const last = await driveWorkflowTurn(ctx, body, orgId, true);
  if (last !== null) sendWorkflowAgentResponse(ctx.res, last);
  writeComplete(ctx.res);
}
