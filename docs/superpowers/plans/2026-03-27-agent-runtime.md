# Agent Execution Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an agent execution loop to the api package and expose it via simulation and production endpoints.

**Architecture:** New executeAgent function in the api package implementing a tool-calling loop. New /simulate-agent backend endpoint streaming SSE events. Extended production execute handler routing by app_type. Same persistence layer for sessions, executions, and step traces.

**Tech Stack:** Supabase (Postgres), Express, OpenRouter API, SSE streaming, Zod

---

## Task 1: Agent Execution Types in API Package

**Files:**
- Create: `packages/api/src/agentLoop/agentLoopTypes.ts`

- [ ] **Step 1: Create the types file**

```ts
// packages/api/src/agentLoop/agentLoopTypes.ts
import type { ModelMessage, Tool } from 'ai';

import type { ActionTokenUsage, TokenLog } from '@src/types/ai/logs.js';
import type { Message } from '@src/types/ai/messages.js';

/** Hard ceiling on steps to prevent infinite loops */
export const AGENT_LOOP_HARD_LIMIT = 50;

export interface AgentLoopConfig {
  systemPrompt: string;
  context: string;
  messages: Message[];
  apiKey: string;
  modelId: string;
  maxSteps: number | null;
  tools: Record<string, Tool>;
}

export interface AgentStepEvent {
  step: number;
  messagesSent: ModelMessage[];
  responseText: string;
  toolCalls: AgentToolCallRecord[];
  tokens: TokenLog;
  durationMs: number;
}

export interface AgentToolCallRecord {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
}

export interface AgentToolEvent {
  step: number;
  toolCall: AgentToolCallRecord;
}

export interface AgentLoopCallbacks {
  onStepStarted?: (step: number) => void;
  onStepProcessed: (event: AgentStepEvent) => void;
  onToolExecuted?: (event: AgentToolEvent) => void;
}

export interface AgentLoopResult {
  finalText: string;
  steps: number;
  totalTokens: TokenLog;
  tokensLogs: ActionTokenUsage[];
  toolCalls: AgentToolCallRecord[];
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/api`

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/agentLoop/agentLoopTypes.ts
git commit -m "feat: add agent execution loop types"
```

---

## Task 2: Agent Loop — LLM Call Helper

**Files:**
- Create: `packages/api/src/agentLoop/agentLlmCaller.ts`

This helper wraps a single LLM call within the agent loop. It uses the same OpenRouter provider infrastructure as the existing graph executor but with a simpler interface: system prompt + conversation messages + tools, returning text and tool calls.

- [ ] **Step 1: Create the LLM caller**

```ts
// packages/api/src/agentLoop/agentLlmCaller.ts
import type { AssistantModelMessage, ModelMessage, Tool, ToolModelMessage } from 'ai';
import { generateText } from 'ai';

import { getOpenRouterModel } from '@src/provider/openRouter.js';
import type { TokenLog } from '@src/types/ai/logs.js';

import type { AgentToolCallRecord } from './agentLoopTypes.js';

const TEMPERATURE = 0;
const TIMEOUT_MS = 90000;
const ZERO = 0;

export interface LlmCallParams {
  apiKey: string;
  modelId: string;
  messages: ModelMessage[];
  tools: Record<string, Tool>;
}

export interface LlmCallResult {
  text: string;
  toolCalls: AgentToolCallRecord[];
  responseMessages: Array<AssistantModelMessage | ToolModelMessage>;
  tokens: TokenLog;
  costUSD: number | undefined;
}

function extractCostFromResult(result: Record<string, unknown>): number | undefined {
  const meta = result.providerMetadata;
  if (typeof meta !== 'object' || meta === null) return undefined;
  const or = (meta as Record<string, unknown>).openrouter;
  if (typeof or !== 'object' || or === null) return undefined;
  const usage = (or as Record<string, unknown>).usage;
  if (typeof usage !== 'object' || usage === null) return undefined;
  const cost = (usage as Record<string, unknown>).cost;
  return typeof cost === 'number' ? cost : undefined;
}

function extractTokens(usage: unknown): TokenLog {
  if (typeof usage !== 'object' || usage === null) {
    return { input: ZERO, output: ZERO, cached: ZERO };
  }
  const u = usage as Record<string, unknown>;
  return {
    input: typeof u.promptTokens === 'number' ? u.promptTokens : ZERO,
    output: typeof u.completionTokens === 'number' ? u.completionTokens : ZERO,
    cached: typeof u.cachedTokens === 'number' ? u.cachedTokens : ZERO,
  };
}

interface RawToolCall {
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  input?: unknown;
}

function mapToolCalls(raw: unknown): AgentToolCallRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawToolCall[]).map((tc) => ({
    toolCallId: typeof tc.toolCallId === 'string' ? tc.toolCallId : '',
    toolName: typeof tc.toolName === 'string' ? tc.toolName : '',
    input: tc.args ?? tc.input,
    output: undefined,
  }));
}

function extractResponseMessages(result: Record<string, unknown>): LlmCallResult['responseMessages'] {
  const resp = result.response;
  if (typeof resp !== 'object' || resp === null) return [];
  const msgs = (resp as Record<string, unknown>).messages;
  if (!Array.isArray(msgs)) return [];
  return msgs as LlmCallResult['responseMessages'];
}

export async function callAgentLlm(params: LlmCallParams): Promise<LlmCallResult> {
  const model = getOpenRouterModel(params.apiKey, params.modelId);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => { controller.abort(); }, TIMEOUT_MS);

  try {
    const result = await generateText({
      model,
      temperature: TEMPERATURE,
      messages: params.messages,
      tools: params.tools,
      maxSteps: 1,
      abortSignal: controller.signal,
      providerOptions: { openai: { store: true } },
    });

    const raw = result as unknown as Record<string, unknown>;
    const tokens = extractTokens(raw.usage);
    tokens.costUSD = extractCostFromResult(raw);

    return {
      text: typeof result.text === 'string' ? result.text : '',
      toolCalls: mapToolCalls(raw.toolCalls),
      responseMessages: extractResponseMessages(raw),
      tokens,
      costUSD: tokens.costUSD,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/api`

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/agentLoop/agentLlmCaller.ts
git commit -m "feat: add agent loop LLM caller helper"
```

---

## Task 3: Agent Loop — Core Execution

**Files:**
- Create: `packages/api/src/agentLoop/agentLoopHelpers.ts`
- Create: `packages/api/src/agentLoop/agentLoop.ts`
- Create: `packages/api/src/agentLoop/index.ts`

The core loop calls the LLM, checks for tool calls, executes tools via the MCP tool infrastructure passed in as `tools`, appends results to messages, and repeats until the LLM has no tool calls or the step limit is reached.

- [ ] **Step 1: Create agentLoopHelpers.ts**

```ts
// packages/api/src/agentLoop/agentLoopHelpers.ts
import type { ModelMessage } from 'ai';

import type { ActionTokenUsage, TokenLog } from '@src/types/ai/logs.js';
import type { Message } from '@src/types/ai/messages.js';

import type { AgentLoopConfig, AgentLoopResult, AgentToolCallRecord } from './agentLoopTypes.js';
import { AGENT_LOOP_HARD_LIMIT } from './agentLoopTypes.js';

const ZERO = 0;

export function resolveMaxSteps(config: AgentLoopConfig): number {
  if (config.maxSteps === null) return AGENT_LOOP_HARD_LIMIT;
  return Math.min(config.maxSteps, AGENT_LOOP_HARD_LIMIT);
}

export function buildSystemMessage(config: AgentLoopConfig): ModelMessage {
  const combined = config.context !== ''
    ? `${config.systemPrompt}\n\n${config.context}`
    : config.systemPrompt;
  return { role: 'system', content: combined };
}

export function buildInitialMessages(config: AgentLoopConfig): ModelMessage[] {
  const system = buildSystemMessage(config);
  const history = config.messages.map((m) => m.message);
  return [system, ...history];
}

export function createEmptyTokens(): TokenLog {
  return { input: ZERO, output: ZERO, cached: ZERO };
}

export function accumulateTokens(target: TokenLog, source: TokenLog): void {
  target.input += source.input;
  target.output += source.output;
  target.cached += source.cached;
  target.costUSD = (target.costUSD ?? ZERO) + (source.costUSD ?? ZERO);
}

export function buildLoopResult(
  finalText: string,
  step: number,
  totalTokens: TokenLog,
  tokensLogs: ActionTokenUsage[],
  allToolCalls: AgentToolCallRecord[]
): AgentLoopResult {
  return { finalText, steps: step, totalTokens, tokensLogs, toolCalls: allToolCalls };
}
```

- [ ] **Step 2: Create agentLoop.ts**

```ts
// packages/api/src/agentLoop/agentLoop.ts
import type { ModelMessage } from 'ai';

import type { ActionTokenUsage } from '@src/types/ai/logs.js';

import { callAgentLlm } from './agentLlmCaller.js';
import {
  accumulateTokens,
  buildInitialMessages,
  buildLoopResult,
  createEmptyTokens,
  resolveMaxSteps,
} from './agentLoopHelpers.js';
import type {
  AgentLoopCallbacks,
  AgentLoopConfig,
  AgentLoopResult,
  AgentToolCallRecord,
} from './agentLoopTypes.js';

const INCREMENT = 1;
const ZERO = 0;

interface LoopState {
  messages: ModelMessage[];
  step: number;
  totalTokens: ReturnType<typeof createEmptyTokens>;
  tokensLogs: ActionTokenUsage[];
  allToolCalls: AgentToolCallRecord[];
}

function createInitialState(config: AgentLoopConfig): LoopState {
  return {
    messages: buildInitialMessages(config),
    step: ZERO,
    totalTokens: createEmptyTokens(),
    tokensLogs: [],
    allToolCalls: [],
  };
}

interface StepResult {
  text: string;
  toolCalls: AgentToolCallRecord[];
  done: boolean;
}

async function executeStep(
  config: AgentLoopConfig,
  state: LoopState,
  callbacks: AgentLoopCallbacks
): Promise<StepResult> {
  const stepNum = state.step + INCREMENT;
  callbacks.onStepStarted?.(stepNum);

  const startTime = Date.now();
  const result = await callAgentLlm({
    apiKey: config.apiKey,
    modelId: config.modelId,
    messages: state.messages,
    tools: config.tools,
  });

  const durationMs = Date.now() - startTime;
  accumulateTokens(state.totalTokens, result.tokens);

  const actionLog: ActionTokenUsage = {
    action: `step-${String(stepNum)}`,
    tokens: { ...result.tokens },
  };
  state.tokensLogs.push(actionLog);

  callbacks.onStepProcessed({
    step: stepNum,
    messagesSent: [...state.messages],
    responseText: result.text,
    toolCalls: result.toolCalls,
    tokens: result.tokens,
    durationMs,
  });

  return {
    text: result.text,
    toolCalls: result.toolCalls,
    done: result.toolCalls.length === ZERO,
  };
}

function appendToolMessages(
  state: LoopState,
  stepResult: StepResult,
  callbacks: AgentLoopCallbacks,
  stepNum: number
): void {
  for (const tc of stepResult.toolCalls) {
    state.messages.push({
      role: 'assistant',
      content: [{
        type: 'tool-call',
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.input,
      }],
    });
    state.messages.push({
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        result: tc.output,
      }],
    });
    state.allToolCalls.push(tc);
    callbacks.onToolExecuted?.({ step: stepNum, toolCall: tc });
  }
}

async function runLoop(
  config: AgentLoopConfig,
  state: LoopState,
  maxSteps: number,
  callbacks: AgentLoopCallbacks
): Promise<AgentLoopResult> {
  while (state.step < maxSteps) {
    const stepResult = await executeStep(config, state, callbacks);
    state.step += INCREMENT;

    if (stepResult.done) {
      return buildLoopResult(
        stepResult.text, state.step, state.totalTokens, state.tokensLogs, state.allToolCalls
      );
    }

    appendToolMessages(state, stepResult, callbacks, state.step);
  }

  return buildLoopResult('', state.step, state.totalTokens, state.tokensLogs, state.allToolCalls);
}

export async function executeAgentLoop(
  config: AgentLoopConfig,
  callbacks: AgentLoopCallbacks
): Promise<AgentLoopResult> {
  const maxSteps = resolveMaxSteps(config);
  const state = createInitialState(config);
  return await runLoop(config, state, maxSteps, callbacks);
}

export async function executeAgentLoopSimple(config: AgentLoopConfig): Promise<AgentLoopResult> {
  const noop = { onStepProcessed: () => {} };
  return await executeAgentLoop(config, noop);
}
```

**Note:** The `generateText` call uses `maxSteps: 1` so the AI SDK executes exactly one round of tool calls per loop iteration — the SDK invokes the tools, collects results, and returns them in `response.messages`. The outer `while` loop then appends those results to the conversation and calls the LLM again. This gives us full control over per-step callbacks, persistence, and step-limit enforcement while letting the SDK handle actual tool invocation. The `appendToolMessages` function uses `tc.toolCallId` (the unique ID generated by the AI SDK for each tool call) rather than `tc.toolName` to correctly correlate tool-call/tool-result message pairs.

- [ ] **Step 3: Create index.ts barrel**

```ts
// packages/api/src/agentLoop/index.ts
export { executeAgentLoop, executeAgentLoopSimple } from './agentLoop.js';
export type {
  AgentLoopCallbacks,
  AgentLoopConfig,
  AgentLoopResult,
  AgentStepEvent,
  AgentToolCallRecord,
  AgentToolEvent,
} from './agentLoopTypes.js';
export { AGENT_LOOP_HARD_LIMIT } from './agentLoopTypes.js';
```

- [ ] **Step 4: Verify types compile**

Run: `npm run typecheck -w packages/api`

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/agentLoop/
git commit -m "feat: add agent execution loop with iterative while-loop runner"
```

---

## Task 4: Export Agent Loop from API Package

**Files:**
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Add agent loop exports**

Add these lines after the existing exports in `packages/api/src/index.ts`:

```ts
export { executeAgentLoop, executeAgentLoopSimple } from './agentLoop/index.js';
export type {
  AgentLoopCallbacks,
  AgentLoopConfig,
  AgentLoopResult,
  AgentStepEvent,
  AgentToolCallRecord,
  AgentToolEvent,
} from './agentLoop/index.js';
export { AGENT_LOOP_HARD_LIMIT } from './agentLoop/index.js';
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/api`

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/index.ts
git commit -m "feat: export agent loop from api package"
```

---

## Task 5: Backend — Simulate Agent Types

**Files:**
- Create: `packages/backend/src/routes/simulateAgentTypes.ts`

- [ ] **Step 1: Create the types and Zod schema**

```ts
// packages/backend/src/routes/simulateAgentTypes.ts
import type { McpServerConfig } from '@daviddh/graph-types';
import type { AgentStepEvent, AgentToolCallRecord, AgentToolEvent } from '@daviddh/llm-graph-runner';
import type { Message } from '@daviddh/llm-graph-runner';
import { z } from 'zod';

/* ─── Request schema ─── */

const McpTransportSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stdio'), command: z.string(), args: z.array(z.string()).optional(), env: z.record(z.string(), z.string()).optional() }),
  z.object({ type: z.literal('sse'), url: z.string(), headers: z.record(z.string(), z.string()).optional() }),
  z.object({ type: z.literal('http'), url: z.string(), headers: z.record(z.string(), z.string()).optional() }),
]);

const McpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  transport: McpTransportSchema,
  enabled: z.boolean().default(true),
  libraryItemId: z.string().optional(),
  variableValues: z.record(z.string(), z.union([
    z.object({ type: z.literal('direct'), value: z.string() }),
    z.object({ type: z.literal('env_ref'), envVariableId: z.string() }),
  ])).optional(),
});

export const SimulateAgentRequestSchema = z.object({
  appType: z.literal('agent'),
  systemPrompt: z.string(),
  context: z.string(),
  messages: z.array(z.unknown()),
  apiKey: z.string(),
  modelId: z.string(),
  maxSteps: z.number().nullable(),
  mcpServers: z.array(McpServerSchema),
});

export interface SimulateAgentRequest {
  appType: 'agent';
  systemPrompt: string;
  context: string;
  messages: Message[];
  apiKey: string;
  modelId: string;
  maxSteps: number | null;
  mcpServers: McpServerConfig[];
}

/* ─── SSE event types ─── */

export interface AgentStepStartedEvent {
  type: 'step_started';
  step: number;
}

export interface AgentStepProcessedEvent {
  type: 'step_processed';
  step: number;
  responseText: string;
  toolCalls: AgentToolCallRecord[];
  tokens: { input: number; output: number; cached: number; costUSD?: number };
  durationMs: number;
}

export interface AgentToolExecutedEvent {
  type: 'tool_executed';
  step: number;
  toolCall: AgentToolCallRecord;
}

export interface AgentResponseEvent {
  type: 'agent_response';
  text: string;
  steps: number;
  totalTokens: { input: number; output: number; cached: number; costUSD?: number };
  toolCalls: AgentToolCallRecord[];
}

export interface AgentSimulationErrorEvent {
  type: 'error';
  message: string;
}

export interface AgentSimulationCompleteEvent {
  type: 'simulation_complete';
}

export type AgentSimulationEvent =
  | AgentStepStartedEvent
  | AgentStepProcessedEvent
  | AgentToolExecutedEvent
  | AgentResponseEvent
  | AgentSimulationErrorEvent
  | AgentSimulationCompleteEvent;
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/simulateAgentTypes.ts
git commit -m "feat: add simulate-agent request/event types and Zod schema"
```

---

## Task 6: Backend — Simulate Agent Handler

**Files:**
- Create: `packages/backend/src/routes/simulateAgentHandler.ts`

The handler follows the exact same pattern as the existing `simulateHandler.ts`: parse request, set SSE headers, create MCP session, run the agent loop, stream events, close session.

- [ ] **Step 1: Create SSE helpers file for agent simulation**

```ts
// packages/backend/src/routes/simulateAgentSse.ts
import type { AgentLoopResult, AgentStepEvent, AgentToolEvent } from '@daviddh/llm-graph-runner';
import type { Response } from 'express';

import type { AgentSimulationEvent } from './simulateAgentTypes.js';

interface Flushable {
  flush: () => void;
}

function hasFlushMethod(value: object): value is Flushable {
  return 'flush' in value && typeof (value as Record<string, unknown>).flush === 'function';
}

function isFlushable(value: unknown): value is Flushable {
  return typeof value === 'object' && value !== null && hasFlushMethod(value);
}

export function writeAgentSSE(res: Response, event: AgentSimulationEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  res.write(payload);
  if (isFlushable(res)) {
    res.flush();
  }
}

export function sendStepStarted(res: Response, step: number): void {
  writeAgentSSE(res, { type: 'step_started', step });
}

export function sendStepProcessed(res: Response, event: AgentStepEvent): void {
  writeAgentSSE(res, {
    type: 'step_processed',
    step: event.step,
    responseText: event.responseText,
    toolCalls: event.toolCalls,
    tokens: event.tokens,
    durationMs: event.durationMs,
  });
}

export function sendToolExecuted(res: Response, event: AgentToolEvent): void {
  writeAgentSSE(res, {
    type: 'tool_executed',
    step: event.step,
    toolCall: event.toolCall,
  });
}

export function sendAgentResponse(res: Response, result: AgentLoopResult): void {
  writeAgentSSE(res, {
    type: 'agent_response',
    text: result.finalText,
    steps: result.steps,
    totalTokens: result.totalTokens,
    toolCalls: result.toolCalls,
  });
}

export function sendAgentError(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : 'Agent simulation failed';
  writeAgentSSE(res, { type: 'error', message });
}
```

- [ ] **Step 2: Create the handler**

```ts
// packages/backend/src/routes/simulateAgentHandler.ts
import { executeAgentLoop } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';

import { consoleLogger } from '../logger.js';
import { type McpSession, closeMcpSession, createMcpSession } from '../mcp/lifecycle.js';
import type { SimulateAgentRequest } from './simulateAgentTypes.js';
import { SimulateAgentRequestSchema } from './simulateAgentTypes.js';
import { setSseHeaders } from './simulate.js';
import {
  sendAgentError,
  sendAgentResponse,
  sendStepProcessed,
  sendStepStarted,
  sendToolExecuted,
  writeAgentSSE,
} from './simulateAgentSse.js';

const EMPTY_SESSION: McpSession = { clients: [], tools: {} };
const HTTP_BAD_REQUEST = 400;

async function runAgentSimulation(
  body: SimulateAgentRequest,
  session: McpSession,
  res: Response
): Promise<void> {
  const result = await executeAgentLoop(
    {
      systemPrompt: body.systemPrompt,
      context: body.context,
      messages: body.messages,
      apiKey: body.apiKey,
      modelId: body.modelId,
      maxSteps: body.maxSteps,
      tools: session.tools,
    },
    {
      onStepStarted: (step: number) => {
        sendStepStarted(res, step);
      },
      onStepProcessed: (event) => {
        sendStepProcessed(res, event);
      },
      onToolExecuted: (event) => {
        sendToolExecuted(res, event);
      },
    }
  );
  sendAgentResponse(res, result);
}

export async function handleSimulateAgent(
  req: Request<Record<string, string>, unknown, unknown>,
  res: Response
): Promise<void> {
  const parsed = SimulateAgentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.message });
    return;
  }
  const body = req.body as SimulateAgentRequest;
  const mcpServers = body.mcpServers ?? [];
  setSseHeaders(res);
  let session: McpSession = EMPTY_SESSION;
  try {
    session = await createMcpSession(mcpServers);
    await runAgentSimulation(body, session, res);
    writeAgentSSE(res, { type: 'simulation_complete' });
  } catch (err) {
    sendAgentError(res, err);
  } finally {
    await closeMcpSession(session);
    res.end();
  }
}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/simulateAgentSse.ts packages/backend/src/routes/simulateAgentHandler.ts
git commit -m "feat: add simulate-agent handler with SSE streaming"
```

---

## Task 7: Backend — Register Simulate Agent Route

**Files:**
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: Import and register the route**

Add the import to `server.ts`:

```ts
import { handleSimulateAgent } from './routes/simulateAgentHandler.js';
```

Add the route after the existing `/simulate` route (around line 61):

```ts
app.post('/simulate-agent', handleSimulateAgent);
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/server.ts
git commit -m "feat: register /simulate-agent endpoint"
```

---

## Task 8: Backend — Extend Production Execute Handler for Agent Type

**Files:**
- Modify: `packages/backend/src/routes/execute/executeHandler.ts`
- Modify: `packages/backend/src/routes/execute/executeFetcher.ts`

The production execute handler currently assumes all published versions are workflows. We need to:
1. Fetch `app_type` from the agents table alongside the graph data
2. Route to the existing workflow executor or the new agent loop based on `app_type`

- [ ] **Step 1: Add app_type to fetched data**

In `fetchGraphAndKeys`, also fetch the agent's `app_type`. Add to `GraphAndKeys`:

```ts
export interface GraphAndKeys {
  graph: RuntimeGraph;
  apiKey: string;
  envVars: DecryptedEnvVars;
  appType: string;
}
```

Update `fetchGraphAndKeys` to also query `app_type` from the `agents` table. Add a new query in parallel:

```ts
async function fetchAppType(supabase: SupabaseClient, agentId: string): Promise<string> {
  const result = await supabase.from('agents').select('app_type').eq('id', agentId).single();
  const row = result.data as { app_type?: string } | null;
  return row?.app_type ?? 'workflow';
}
```

Add `agentId` to `GraphFetchParams` and call `fetchAppType` in parallel:

```ts
const [graphData, apiKey, envVars, appType] = await Promise.all([
  getPublishedGraphData(supabase, agentId, version),
  getDecryptedApiKeyValue(supabase, productionApiKeyId),
  getDecryptedEnvVariables(supabase, orgId),
  fetchAppType(supabase, agentId),
]);
return { graph: ensureGraphData(graphData), apiKey: ensureApiKey(apiKey), envVars, appType };
```

- [ ] **Step 2: Add agent config fetching to executeFetcher**

The agent config (system_prompt, max_steps, context) is fetched from the `agents` and `agent_context_items` tables at execution time, not from the version snapshot's graph data. Add new query functions and extend `FetchedData` in `executeFetcher.ts`:

```ts
interface AgentConfigRow {
  system_prompt: string | null;
  max_steps: number | null;
}

interface AgentContextRow {
  content: string;
}

export interface AgentConfig {
  systemPrompt: string;
  context: string;
  maxSteps: number | null;
}

export async function fetchAgentConfig(supabase: SupabaseClient, agentId: string): Promise<AgentConfig> {
  const [agentResult, contextResult] = await Promise.all([
    supabase.from('agents').select('system_prompt, max_steps').eq('id', agentId).single(),
    supabase.from('agent_context_items').select('content').eq('agent_id', agentId).order('position'),
  ]);

  const agentRow = agentResult.data as AgentConfigRow | null;
  const contextRows = (contextResult.data ?? []) as AgentContextRow[];
  const context = contextRows.map((r) => r.content).join('\n\n');

  return {
    systemPrompt: agentRow?.system_prompt ?? '',
    context,
    maxSteps: agentRow?.max_steps ?? null,
  };
}
```

Update the full `FetchedData` interface to include both `appType` and `agentConfig`:

```ts
export interface FetchedData {
  graph: RuntimeGraph;
  apiKey: string;
  envVars: DecryptedEnvVars;
  sessionDbId: string;
  currentNodeId: string;
  structuredOutputs: Record<string, unknown[]>;
  isNew: boolean;
  messageHistory: Message[];
  appType: string;
  agentConfig: AgentConfig | null;
}
```

In `fetchAllData` (in `executeHandler.ts`), propagate `appType` and conditionally fetch agent config:

```ts
const agentConfig = graphAndKeys.appType === 'agent'
  ? await fetchAgentConfig(supabase, agentId)
  : null;
return { ...graphAndKeys, ...sessionData, graph: resolvedGraph, agentConfig };
```

- [ ] **Step 3: Add agent loop execution path to executeHandler**

In `executeHandler.ts`, add the agent execution path. Create a new file `packages/backend/src/routes/execute/executeAgentPath.ts` to hold agent-specific handler logic and keep the main handler under the line limit:

```ts
// packages/backend/src/routes/execute/executeAgentPath.ts
import type { AgentLoopResult } from '@daviddh/llm-graph-runner';
import { executeAgentLoop } from '@daviddh/llm-graph-runner';
import type { Response } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { type McpSession, closeMcpSession, createMcpSession } from '../../mcp/lifecycle.js';
import type { AgentConfig, FetchedData } from './executeFetcher.js';
import {
  setSseHeaders,
  writePublicSSE,
} from './executeHelpers.js';
import { persistAgentPostExecution } from './agentExecutionPersistence.js';
import { persistPreExecution } from './executePersistence.js';
import type { AgentExecutionResponse } from './executeTypes.js';

const ZERO = 0;
const EMPTY_SESSION: McpSession = { clients: [], tools: {} };

/* ─── Response builders ─── */

function buildAgentExecResponse(result: AgentLoopResult, durationMs: number): AgentExecutionResponse {
  const { totalTokens } = result;
  return {
    text: result.finalText,
    currentNodeId: '',
    visitedNodes: [],
    toolCalls: result.toolCalls.map((tc) => ({
      name: tc.toolName,
      args: tc.input,
      result: tc.output,
    })),
    structuredOutputs: {},
    tokenUsage: {
      inputTokens: totalTokens.input,
      outputTokens: totalTokens.output,
      cachedTokens: totalTokens.cached,
      totalCost: totalTokens.costUSD ?? ZERO,
    },
    durationMs,
  };
}

/* ─── Agent execution context ─── */

interface AgentExecContext {
  supabase: SupabaseClient;
  executionId: string;
  sessionDbId: string;
  model: string;
  agentConfig: AgentConfig;
  fetched: FetchedData;
}

/* ─── MCP session helper ─── */

async function createAgentMcpSession(fetched: FetchedData): Promise<McpSession> {
  const { mcpServers } = fetched.graph;
  if (mcpServers === undefined || mcpServers.length === ZERO) return EMPTY_SESSION;
  return await createMcpSession(mcpServers);
}

/* ─── Core agent execution ─── */

async function runAgentLoop(
  ctx: AgentExecContext,
  session: McpSession,
  onStepStarted?: (step: number) => void
): Promise<AgentLoopResult> {
  return await executeAgentLoop(
    {
      systemPrompt: ctx.agentConfig.systemPrompt,
      context: ctx.agentConfig.context,
      messages: ctx.fetched.messageHistory,
      apiKey: ctx.fetched.apiKey,
      modelId: ctx.model,
      maxSteps: ctx.agentConfig.maxSteps,
      tools: session.tools,
    },
    {
      onStepStarted,
      onStepProcessed: () => {},
    }
  );
}

async function persistAgentResult(
  ctx: AgentExecContext,
  result: AgentLoopResult,
  durationMs: number
): Promise<void> {
  await persistAgentPostExecution(ctx.supabase, {
    executionId: ctx.executionId,
    sessionDbId: ctx.sessionDbId,
    agentResult: result,
    currentNodeId: '',
    structuredOutputs: {},
    durationMs,
    model: ctx.model,
  });
}

/* ─── Streaming handler ─── */

export async function handleAgentStreaming(
  ctx: AgentExecContext,
  res: Response
): Promise<void> {
  setSseHeaders(res);
  const startTime = Date.now();
  let session: McpSession = EMPTY_SESSION;

  try {
    session = await createAgentMcpSession(ctx.fetched);
    const result = await runAgentLoop(ctx, session, (step) => {
      writePublicSSE(res, { type: 'node_visited', nodeId: `step-${String(step)}` });
    });
    const durationMs = Date.now() - startTime;
    const response = buildAgentExecResponse(result, durationMs);
    writePublicSSE(res, { type: 'done', response });
    await persistAgentResult(ctx, result, durationMs);
  } finally {
    await closeMcpSession(session);
  }
}

/* ─── Non-streaming handler ─── */

export async function handleAgentNonStreaming(
  ctx: AgentExecContext,
  res: Response
): Promise<void> {
  const startTime = Date.now();
  let session: McpSession = EMPTY_SESSION;

  try {
    session = await createAgentMcpSession(ctx.fetched);
    const result = await runAgentLoop(ctx, session);
    const durationMs = Date.now() - startTime;
    res.json(buildAgentExecResponse(result, durationMs));
    await persistAgentResult(ctx, result, durationMs);
  } finally {
    await closeMcpSession(session);
  }
}
```

In the main `handleExecute` function in `executeHandler.ts`, add the routing logic. Import the new handlers and `AgentConfig`:

```ts
import { handleAgentStreaming, handleAgentNonStreaming } from './executeAgentPath.js';
```

Update the main handler body:

```ts
if (ctx.fetched.appType === 'agent') {
  const { agentConfig } = ctx.fetched;
  if (agentConfig === null) throw new HttpError(HTTP_INTERNAL, 'Agent config not found');
  const agentCtx = {
    supabase: ctx.supabase,
    executionId: ctx.executionId,
    sessionDbId: ctx.fetched.sessionDbId,
    model: ctx.model,
    agentConfig,
    fetched: ctx.fetched,
  };
  if (ctx.input.stream) {
    await handleAgentStreaming(agentCtx, res);
  } else {
    await handleAgentNonStreaming(agentCtx, res);
  }
} else {
  if (ctx.input.stream) {
    await handleStreaming(ctx, res);
  } else {
    await handleNonStreaming(ctx, res);
  }
}
```

**Important:** Keep each function under 40 lines. The agent execution path is in a separate file to avoid exceeding the 300-line limit in `executeHandler.ts`.

- [ ] **Step 4: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/executeHandler.ts packages/backend/src/routes/execute/executeFetcher.ts packages/backend/src/routes/execute/executeAgentPath.ts
git commit -m "feat: route production execution by app_type (workflow vs agent)"
```

---

## Task 9: Backend — Agent Step Persistence

**Files:**
- Create: `packages/backend/src/routes/execute/agentExecutionPersistence.ts`

The agent loop produces step-level data that needs to be persisted into `agent_execution_nodes` using `node_id = 'step-{N}'`. This goes in a **separate file** from `executePersistence.ts` (which is already 257 lines — adding ~55 more would exceed the 300-line limit).

- [ ] **Step 1: Create `agentExecutionPersistence.ts` with step persistence and post-execution helpers**

```ts
// packages/backend/src/routes/execute/agentExecutionPersistence.ts
import type { AgentLoopResult } from '@daviddh/llm-graph-runner';
import type { ActionTokenUsage } from '@daviddh/llm-graph-runner';

import {
  completeExecution,
  refreshExecutionSummary,
  saveExecutionMessage,
  saveNodeVisit,
  updateSessionState,
} from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

const ZERO = 0;

/* ─── Agent step persistence ─── */

interface AgentStepPersistenceParams {
  supabase: SupabaseClient;
  executionId: string;
  tokensLogs: ActionTokenUsage[];
  model: string;
}

async function persistAgentSteps(params: AgentStepPersistenceParams): Promise<void> {
  const { supabase, executionId, tokensLogs, model } = params;
  const saves = tokensLogs.map(async (log, index) => {
    await saveNodeVisit(supabase, {
      executionId,
      nodeId: log.action,
      stepOrder: index,
      messagesSent: [],
      response: {},
      inputTokens: log.tokens.input,
      outputTokens: log.tokens.output,
      cachedTokens: log.tokens.cached,
      cost: log.tokens.costUSD ?? ZERO,
      durationMs: ZERO,
      model,
    });
  });
  await Promise.all(saves);
}

/* ─── Assistant message persistence ─── */

interface AssistantMessageParams {
  sessionDbId: string;
  executionId: string;
  nodeId: string;
  text: string;
}

async function persistAssistantMessage(
  supabase: SupabaseClient,
  params: AssistantMessageParams
): Promise<void> {
  if (params.text === '') return;
  await saveExecutionMessage(supabase, {
    sessionId: params.sessionDbId,
    executionId: params.executionId,
    nodeId: params.nodeId,
    role: 'assistant',
    content: params.text,
  });
}

/* ─── Completion persistence ─── */

async function persistCompletion(
  supabase: SupabaseClient,
  executionId: string,
  totals: { input: number; output: number; cached: number; costUSD?: number },
  durationMs: number
): Promise<void> {
  await completeExecution(supabase, executionId, {
    inputTokens: totals.input,
    outputTokens: totals.output,
    cachedTokens: totals.cached,
    totalCost: totals.costUSD ?? ZERO,
    durationMs,
  });
}

/* ─── Full agent post-execution persistence ─── */

export interface AgentPostExecutionParams {
  executionId: string;
  sessionDbId: string;
  agentResult: AgentLoopResult;
  currentNodeId: string;
  structuredOutputs: Record<string, unknown[]>;
  durationMs: number;
  model: string;
}

export async function persistAgentPostExecution(
  supabase: SupabaseClient,
  params: AgentPostExecutionParams
): Promise<void> {
  try {
    await persistAgentSteps({
      supabase,
      executionId: params.executionId,
      tokensLogs: params.agentResult.tokensLogs,
      model: params.model,
    });

    await persistAssistantMessage(supabase, {
      sessionDbId: params.sessionDbId,
      executionId: params.executionId,
      nodeId: params.currentNodeId,
      text: params.agentResult.finalText,
    });

    await persistCompletion(
      supabase,
      params.executionId,
      params.agentResult.totalTokens,
      params.durationMs
    );

    await updateSessionState(supabase, params.sessionDbId, {
      currentNodeId: params.currentNodeId,
      structuredOutputs: params.structuredOutputs,
    });

    refreshExecutionSummary(supabase).catch(() => {
      /* ignore refresh errors */
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown persistence error';
    process.stdout.write(`[execute] persistAgentPostExecution failed: ${msg}\n`);
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/execute/agentExecutionPersistence.ts
git commit -m "feat: add agent step persistence in separate file using step-N node IDs"
```

---

## Task 10: API Package — Agent Loop Unit Tests

**Files:**
- Create: `packages/api/src/agentLoop/__tests__/agentLoopHelpers.test.ts`

- [ ] **Step 1: Write helper tests**

```ts
// packages/api/src/agentLoop/__tests__/agentLoopHelpers.test.ts
import { describe, expect, it } from '@jest/globals';

import { MESSAGES_PROVIDER } from '@src/types/ai/messages.js';

import {
  accumulateTokens,
  buildInitialMessages,
  buildLoopResult,
  createEmptyTokens,
  resolveMaxSteps,
} from '../agentLoopHelpers.js';
import { AGENT_LOOP_HARD_LIMIT } from '../agentLoopTypes.js';
import type { AgentLoopConfig } from '../agentLoopTypes.js';

const BASE_CONFIG: AgentLoopConfig = {
  systemPrompt: 'You are a helpful assistant.',
  context: 'User likes cats.',
  messages: [],
  apiKey: 'key',
  modelId: 'test-model',
  maxSteps: null,
  tools: {},
};

describe('resolveMaxSteps', () => {
  it('returns hard limit when maxSteps is null', () => {
    expect(resolveMaxSteps(BASE_CONFIG)).toBe(AGENT_LOOP_HARD_LIMIT);
  });

  it('returns maxSteps when below hard limit', () => {
    const config = { ...BASE_CONFIG, maxSteps: 10 };
    expect(resolveMaxSteps(config)).toBe(10);
  });

  it('caps at hard limit', () => {
    const config = { ...BASE_CONFIG, maxSteps: 999 };
    expect(resolveMaxSteps(config)).toBe(AGENT_LOOP_HARD_LIMIT);
  });
});

describe('buildInitialMessages', () => {
  it('creates system message with prompt and context', () => {
    const msgs = buildInitialMessages(BASE_CONFIG);
    expect(msgs[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.\n\nUser likes cats.',
    });
  });

  it('uses prompt only when context is empty', () => {
    const config = { ...BASE_CONFIG, context: '' };
    const msgs = buildInitialMessages(config);
    expect(msgs[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
  });
});

describe('createEmptyTokens', () => {
  it('returns zeroed token log', () => {
    const tokens = createEmptyTokens();
    expect(tokens).toEqual({ input: 0, output: 0, cached: 0 });
  });
});

describe('accumulateTokens', () => {
  it('adds source into target', () => {
    const target = { input: 10, output: 5, cached: 2 };
    const source = { input: 3, output: 7, cached: 1, costUSD: 0.01 };
    accumulateTokens(target, source);
    expect(target).toEqual({ input: 13, output: 12, cached: 3, costUSD: 0.01 });
  });
});

describe('buildLoopResult', () => {
  it('assembles result correctly', () => {
    const tokens = { input: 100, output: 50, cached: 10 };
    const result = buildLoopResult('done', 3, tokens, [], []);
    expect(result.finalText).toBe('done');
    expect(result.steps).toBe(3);
    expect(result.totalTokens).toEqual(tokens);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test -w packages/api -- --testPathPattern=agentLoopHelpers`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/agentLoop/__tests__/agentLoopHelpers.test.ts
git commit -m "test: add unit tests for agent loop helpers"
```

---

## Task 11: Full Check and Fix

- [ ] **Step 1: Run format**

Run: `npm run format`

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Fix any ESLint errors. Pay special attention to:
- `max-lines-per-function: 40` — extract helpers if any function exceeds this
- `max-lines: 300` — split files if they exceed this
- `max-depth: 2` — flatten any deep nesting
- No `eslint-disable` comments allowed
- No `any` types allowed

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Fix any type errors across all packages.

- [ ] **Step 4: Run api tests**

Run: `npm run test -w packages/api`

Expected: All tests pass including the new agent loop helper tests.

- [ ] **Step 5: Run full check**

Run: `npm run check`

Expected: Format, lint, and typecheck all pass.

- [ ] **Step 6: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve lint, format, and type errors for agent runtime"
```
