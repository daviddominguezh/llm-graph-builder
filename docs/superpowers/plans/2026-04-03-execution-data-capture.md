# Execution Data Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring agent execution data capture to full parity with workflow capture — persist raw model responses, reasoning, error details, and actual duration per step.

**Architecture:** Extend `AgentStepEvent` with three new fields (`responseMessages`, `reasoning`, `error`), populate them in the agent loop from the existing `LlmCallResult`, update the persistence layer to store them, and fix duration tracking (currently always 0).

**Tech Stack:** TypeScript, AI SDK (`ai` package), Supabase (PostgreSQL)

---

## File Map

### Modified files
| File | Changes |
|------|---------|
| `packages/api/src/agentLoop/agentLoopTypes.ts` | Add `responseMessages`, `reasoning`, `error` to `AgentStepEvent` |
| `packages/api/src/agentLoop/agentLoop.ts` | Populate new fields in `recordStepResult`; extract reasoning from `responseMessages` |
| `packages/api/src/agentLoop/agentLlmCaller.ts` | Extract reasoning from response, add to `LlmCallResult` |
| `packages/backend/src/routes/execute/agentExecutionPersistence.ts` | Update `buildStepResponse` to include new fields; pass actual `durationMs` |
| `packages/backend/src/routes/simulateAgentSse.ts` | Include new fields in `step_processed` SSE event |

### Test files
| File | Purpose |
|------|---------|
| `packages/api/src/agentLoop/__tests__/agentLoopTypes.test.ts` | Verify new fields exist on `AgentStepEvent` |

---

### Task 1: Extend LlmCallResult with reasoning

**Files:**
- Modify: `packages/api/src/agentLoop/agentLlmCaller.ts`

- [ ] **Step 1: Add reasoning extraction to processLlmResponse**

In `packages/api/src/agentLoop/agentLlmCaller.ts`, add a `reasoning` field to `LlmCallResult` and extract it from response messages:

Add the `reasoning` field to the `LlmCallResult` interface (after line 35):

```typescript
export interface LlmCallResult {
  text: string;
  toolCalls: AgentToolCallRecord[];
  responseMessages: Array<AssistantModelMessage | ToolModelMessage>;
  tokens: TokenLog;
  costUSD: number | undefined;
  reasoning: string | undefined;  // NEW
}
```

Add a reasoning extractor function (after line 105):

```typescript
function extractReasoning(responseMessages: LlmCallResult['responseMessages']): string | undefined {
  for (const msg of responseMessages) {
    if (msg.role !== 'assistant') continue;
    for (const part of msg.content) {
      if (part.type === 'reasoning') {
        return typeof part.text === 'string' ? part.text : undefined;
      }
    }
  }
  return undefined;
}
```

Update `processLlmResponse` (around line 152) to include reasoning:

```typescript
function processLlmResponse(result: Record<string, unknown>): LlmCallResult {
  // ... existing code ...
  const responseMessages = extractResponseMessages(result);
  const reasoning = extractReasoning(responseMessages);
  // ... existing code ...

  return {
    text: typeof result.text === 'string' ? result.text : '',
    toolCalls,
    responseMessages,
    tokens,
    costUSD: tokens.costUSD,
    reasoning,
  };
}
```

- [ ] **Step 2: Run typecheck to verify**

```bash
npm run typecheck -w packages/api
```

Expected: PASS (no consumers reference `reasoning` yet, and adding an optional field is backwards-compatible)

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/agentLoop/agentLlmCaller.ts
git commit -m "feat: extract reasoning from LLM response in agent loop"
```

---

### Task 2: Extend AgentStepEvent with new fields

**Files:**
- Modify: `packages/api/src/agentLoop/agentLoopTypes.ts`

- [ ] **Step 1: Add new fields to AgentStepEvent**

In `packages/api/src/agentLoop/agentLoopTypes.ts`, update the `AgentStepEvent` interface (line 26-33):

```typescript
export interface AgentStepEvent {
  step: number;
  messagesSent: ModelMessage[];
  responseText: string;
  responseMessages: unknown[];    // NEW: full raw model response objects
  reasoning?: string;             // NEW: extended thinking / chain-of-thought
  toolCalls: AgentToolCallRecord[];
  tokens: TokenLog;
  durationMs: number;
  error?: string;                 // NEW: error details for this step
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck -w packages/api
```

Expected: FAIL — `recordStepResult` in `agentLoop.ts` doesn't provide the new required field `responseMessages`. This is expected and will be fixed in the next task.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/agentLoop/agentLoopTypes.ts
git commit -m "feat: extend AgentStepEvent with responseMessages, reasoning, error"
```

---

### Task 3: Populate new fields in agent loop

**Files:**
- Modify: `packages/api/src/agentLoop/agentLoop.ts`

- [ ] **Step 1: Update recordStepResult to include new fields**

In `packages/api/src/agentLoop/agentLoop.ts`, update the `recordStepResult` function (line 67-78):

```typescript
function recordStepResult(state: LoopState, params: StepRecordParams, callbacks: AgentLoopCallbacks): void {
  accumulateTokens(state.totalTokens, params.result.tokens);
  state.tokensLogs.push({ action: `step-${String(params.stepNum)}`, tokens: { ...params.result.tokens } });
  callbacks.onStepProcessed({
    step: params.stepNum,
    messagesSent: [...state.messages],
    responseText: params.result.text,
    responseMessages: params.result.responseMessages,
    reasoning: params.result.reasoning,
    toolCalls: params.result.toolCalls,
    tokens: params.result.tokens,
    durationMs: params.durationMs,
  });
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck -w packages/api
```

Expected: PASS

- [ ] **Step 3: Run tests**

```bash
npm run test -w packages/api
```

Expected: PASS (existing tests should still work since the new fields are additive)

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/agentLoop/agentLoop.ts
git commit -m "feat: populate responseMessages, reasoning in agent step events"
```

---

### Task 4: Update agent execution persistence

**Files:**
- Modify: `packages/backend/src/routes/execute/agentExecutionPersistence.ts`

- [ ] **Step 1: Update buildStepResponse to include new fields**

In `packages/backend/src/routes/execute/agentExecutionPersistence.ts`, update `buildStepResponse` (line 23-26):

```typescript
function buildStepResponse(stepEvent: AgentStepEvent | undefined): unknown {
  if (stepEvent === undefined) return {};
  return {
    text: stepEvent.responseText,
    toolCalls: stepEvent.toolCalls,
    responseMessages: stepEvent.responseMessages,
    reasoning: stepEvent.reasoning,
    error: stepEvent.error,
  };
}
```

- [ ] **Step 2: Fix duration tracking — pass actual durationMs**

In the same file, update `persistAgentSteps` (line 28-47). Change the `durationMs` value from `ZERO` to the actual step event duration:

```typescript
async function persistAgentSteps(params: AgentStepPersistenceParams): Promise<void> {
  const { supabase, executionId, stepEvents, tokensLogs, model } = params;
  const saves = tokensLogs.map(async (log, index) => {
    const stepEvent = stepEvents.at(index);
    const messagesSent = stepEvent === undefined ? [] : stepEvent.messagesSent;
    await saveNodeVisit(supabase, {
      executionId,
      nodeId: log.action,
      stepOrder: index,
      messagesSent,
      response: buildStepResponse(stepEvent),
      inputTokens: log.tokens.input,
      outputTokens: log.tokens.output,
      cachedTokens: log.tokens.cached,
      cost: log.tokens.costUSD ?? ZERO,
      durationMs: stepEvent?.durationMs ?? ZERO,
      model,
    });
  });
  await Promise.all(saves);
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck -w packages/backend
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/execute/agentExecutionPersistence.ts
git commit -m "feat: persist full model responses, reasoning, errors, and actual duration for agents"
```

---

### Task 5: Update SSE events with new fields

**Files:**
- Modify: `packages/backend/src/routes/simulateAgentSse.ts`

- [ ] **Step 1: Read the current SSE event writer**

Read `packages/backend/src/routes/simulateAgentSse.ts` to understand the current `step_processed` event structure.

- [ ] **Step 2: Add new fields to step_processed SSE event**

Update the `writeStepProcessed` function (or equivalent) to include the new fields in the SSE payload:

The `step_processed` event should include `responseMessages`, `reasoning`, and `error` from the `AgentStepEvent`. Find the function that writes this event and add:

```typescript
// In the step_processed event payload, add:
responseMessages: event.responseMessages,
reasoning: event.reasoning,
error: event.error,
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck -w packages/backend
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/simulateAgentSse.ts
git commit -m "feat: include responseMessages, reasoning, error in step_processed SSE events"
```

---

### Task 6: Run full check

- [ ] **Step 1: Run full project check**

```bash
npm run check
```

Expected: PASS with no new errors

- [ ] **Step 2: Run API tests**

```bash
npm run test -w packages/api
```

Expected: All existing tests pass

- [ ] **Step 3: Commit any formatting fixes**

```bash
git add -A
git commit -m "fix: formatting after execution data capture changes"
```
