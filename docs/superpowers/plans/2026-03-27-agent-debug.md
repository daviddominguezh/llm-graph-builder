# Agent Debug & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the chat-based debug view for agent-type executions with turns, steps, and step inspection.

**Architecture:** New AgentDebugView component replacing DebugView for agent-type apps. Chat timeline with turn grouping derived from execution messages and step traces. Step inspector showing full LLM request/response. Reuses existing session/execution list, metadata bar, and dashboard queries.

**Tech Stack:** Next.js 16, React, shadcn/ui, next-intl

---

## Task 1: Backend Query for Execution Messages

**Files:**
- Modify: `packages/backend/src/db/queries/dashboardQueries.ts`
- Modify: `packages/backend/src/db/queries/dashboardTypes.ts`

- [ ] **Step 1: Add ExecutionMessageRow type to dashboardTypes.ts**

Add the new interface after the existing `NodeVisitRow` interface:

```ts
export interface ExecutionMessageRow {
  id: string;
  execution_id: string;
  node_id: string;
  role: string;
  content: unknown;
  tool_calls: unknown;
  tool_call_id: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Add type guard and query function to dashboardQueries.ts**

Add the type guard near the other guards (after `isNodeVisitArray`):

```ts
function isMessageArray(val: unknown): val is ExecutionMessageRow[] {
  return Array.isArray(val);
}
```

Add the export to the type re-export block at the top:

```ts
export type {
  AgentSummaryRow,
  DashboardParams,
  ExecutionMessageRow,
  ExecutionSummaryRow,
  NodeVisitRow,
  PaginatedResult,
  SessionRow,
  TenantExecutionRow,
  TenantSummaryRow,
  TimeSeriesPoint,
} from './dashboardTypes.js';
```

Add the query function after `getNodeVisitsForExecution`:

```ts
/* ------------------------------------------------------------------ */
/*  6b. Messages for Execution                                         */
/* ------------------------------------------------------------------ */

export async function getMessagesForExecution(
  supabase: SupabaseClient,
  executionId: string
): Promise<{ rows: ExecutionMessageRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_execution_messages')
    .select('id, execution_id, node_id, role, content, tool_calls, tool_call_id, created_at')
    .eq('execution_id', executionId)
    .order('created_at', { ascending: true });

  if (error !== null) return { rows: [], error: error.message };
  return { rows: isMessageArray(data) ? data : [], error: null };
}
```

- [ ] **Step 3: Verify types compile**

```bash
npm run typecheck -w packages/backend
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/db/queries/dashboardQueries.ts packages/backend/src/db/queries/dashboardTypes.ts
git commit -m "feat: add getMessagesForExecution query and ExecutionMessageRow type"
```

---

## Task 2: Backend Route for Execution Messages

**Files:**
- Create: `packages/backend/src/routes/dashboard/getExecutionMessages.ts`
- Modify: `packages/backend/src/routes/dashboard/dashboardRouter.ts`

- [ ] **Step 1: Create the route handler**

Create `packages/backend/src/routes/dashboard/getExecutionMessages.ts`:

```ts
import type { Request } from 'express';

import { getMessagesForExecution } from '../../db/queries/dashboardQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getExecutionIdParam } from './dashboardHelpers.js';

export async function handleGetExecutionMessages(req: Request, res: AuthenticatedResponse): Promise<void> {
  const executionId = getExecutionIdParam(req);

  if (executionId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'executionId is required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const { rows, error } = await getMessagesForExecution(supabase, executionId);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json(rows);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 2: Register the route in dashboardRouter.ts**

Add the import:

```ts
import { handleGetExecutionMessages } from './getExecutionMessages.js';
```

Add the route after the existing `handleGetNodeVisits` line:

```ts
dashboardRouter.get('/executions/:executionId/messages', handleGetExecutionMessages);
```

- [ ] **Step 3: Verify types compile**

```bash
npm run typecheck -w packages/backend
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/dashboard/getExecutionMessages.ts packages/backend/src/routes/dashboard/dashboardRouter.ts
git commit -m "feat: add GET /executions/:executionId/messages route"
```

---

## Task 3: Frontend API Client for Execution Messages

**Files:**
- Modify: `packages/web/app/lib/dashboardQueries.ts`
- Modify: `packages/web/app/lib/dashboard.ts`
- Modify: `packages/web/app/actions/dashboard.ts`

- [ ] **Step 1: Add ExecutionMessageRow type and query to dashboardQueries.ts**

Add the interface after the `NodeVisitRow` interface:

```ts
export interface ExecutionMessageRow {
  id: string;
  execution_id: string;
  node_id: string;
  role: string;
  content: unknown;
  tool_calls: unknown;
  tool_call_id: string | null;
  created_at: string;
}
```

Add the query function after `getNodeVisitsForExecution`:

```ts
/* ------------------------------------------------------------------ */
/*  5b. Messages for Execution                                         */
/* ------------------------------------------------------------------ */

export async function getMessagesForExecution(
  executionId: string
): Promise<{ rows: ExecutionMessageRow[]; error: string | null }> {
  try {
    const url = `/dashboard/executions/${encodeURIComponent(executionId)}/messages`;
    const data = await fetchFromBackend('GET', url);

    if (!isRowArray(data)) {
      return { rows: [], error: 'Invalid response' };
    }

    return { rows: data as ExecutionMessageRow[], error: null };
  } catch (err) {
    return { rows: [], error: extractError(err) };
  }
}
```

- [ ] **Step 2: Re-export from dashboard.ts**

Add `ExecutionMessageRow` to the type export and `getMessagesForExecution` to the function export:

```ts
export type {
  AgentSummaryRow,
  DashboardParams,
  ExecutionMessageRow,
  ExecutionSummaryRow,
  NodeVisitRow,
  SessionRow,
  TenantExecutionRow,
  TenantSummaryRow,
  TimeSeriesPoint,
} from './dashboardQueries';

export {
  deleteSession,
  getAgentSummary,
  getDashboardTimeSeries,
  getExecutionsByTenant,
  getExecutionsForSession,
  getMessagesForExecution,
  getNodeVisitsForExecution,
  getSessionDetail,
  getSessionsByAgent,
  getTenantSummary,
} from './dashboardQueries';
```

- [ ] **Step 3: Add server action in actions/dashboard.ts**

Add the import of the new type:

```ts
import type {
  AgentSummaryRow,
  DashboardParams,
  ExecutionMessageRow,
  ExecutionSummaryRow,
  NodeVisitRow,
  SessionRow,
  TenantExecutionRow,
  TenantSummaryRow,
  TimeSeriesPoint,
} from '@/app/lib/dashboard';
```

Add the import of the new function:

```ts
import {
  deleteSession as deleteSessionLib,
  getAgentSummary as getAgentSummaryLib,
  getDashboardTimeSeries as getDashboardTimeSeriesLib,
  getExecutionsByTenant as getExecutionsByTenantLib,
  getExecutionsForSession as getExecutionsForSessionLib,
  getMessagesForExecution as getMessagesForExecutionLib,
  getNodeVisitsForExecution as getNodeVisitsForExecutionLib,
  getSessionDetail as getSessionDetailLib,
  getSessionsByAgent as getSessionsByAgentLib,
  getTenantSummary as getTenantSummaryLib,
} from '@/app/lib/dashboard';
```

Add the server action after `fetchNodeVisitsForExecution`:

```ts
export async function fetchMessagesForExecution(
  executionId: string
): Promise<{ rows: ExecutionMessageRow[]; error: string | null }> {
  serverLog('[fetchMessagesForExecution] executionId:', executionId);
  const res = await getMessagesForExecutionLib(executionId);
  if (res.error !== null) serverError('[fetchMessagesForExecution] error:', res.error);
  return res;
}
```

- [ ] **Step 4: Verify types compile**

```bash
npm run typecheck -w packages/web
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/dashboardQueries.ts packages/web/app/lib/dashboard.ts packages/web/app/actions/dashboard.ts
git commit -m "feat: add frontend API client for execution messages"
```

---

## Task 4: Turn/Step Grouping Logic

**Files:**
- Create: `packages/web/app/components/dashboard/agent-debug/agentDebugTypes.ts`
- Create: `packages/web/app/components/dashboard/agent-debug/turnGrouping.ts`

- [ ] **Step 1: Create type definitions**

Create `packages/web/app/components/dashboard/agent-debug/agentDebugTypes.ts`:

```ts
import type { ExecutionMessageRow, NodeVisitRow } from '@/app/lib/dashboard';

export interface AgentStep {
  stepOrder: number;
  nodeId: string;
  visit: NodeVisitRow;
}

export interface AgentTurn {
  turnIndex: number;
  userMessage: ExecutionMessageRow | null;
  assistantMessages: ExecutionMessageRow[];
  steps: AgentStep[];
}

export interface AgentDebugData {
  turns: AgentTurn[];
  totalSteps: number;
}
```

- [ ] **Step 2: Create the turn grouping logic**

Create `packages/web/app/components/dashboard/agent-debug/turnGrouping.ts`:

```ts
import type { ExecutionMessageRow, NodeVisitRow } from '@/app/lib/dashboard';

import type { AgentDebugData, AgentStep, AgentTurn } from './agentDebugTypes';

const STEP_PREFIX = 'step-';

function isStepNode(nodeId: string): boolean {
  return nodeId.startsWith(STEP_PREFIX);
}

function buildStepsFromVisits(visits: NodeVisitRow[]): AgentStep[] {
  return visits.filter((v) => isStepNode(v.node_id)).map((v) => ({
    stepOrder: v.step_order,
    nodeId: v.node_id,
    visit: v,
  }));
}

function isUserMessage(msg: ExecutionMessageRow): boolean {
  return msg.role === 'user';
}

function splitByUserMessages(messages: ExecutionMessageRow[]): ExecutionMessageRow[][] {
  const groups: ExecutionMessageRow[][] = [];
  let current: ExecutionMessageRow[] = [];

  for (const msg of messages) {
    if (isUserMessage(msg) && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(msg);
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

function buildTurnFromGroup(group: ExecutionMessageRow[], turnIndex: number): AgentTurn {
  const userMessage = group.find(isUserMessage) ?? null;
  const assistantMessages = group.filter((m) => !isUserMessage(m));
  return { turnIndex, userMessage, assistantMessages, steps: [] };
}

/**
 * Assign steps to turns based on step_order relative to message ordering.
 *
 * Each turn covers a range of step_orders: from after the previous user
 * message's position to before the next user message. We derive the
 * boundary for each turn from its messages' created_at timestamps and
 * compare against step_order (which reflects execution order).
 *
 * Algorithm:
 * 1. Build an array of "turn boundaries" — each turn owns the step_orders
 *    that fall between the previous turn's last message index and this
 *    turn's last message index (inclusive).
 * 2. Since both messages and steps are ordered chronologically, we use
 *    a single pass with a turn pointer.
 */
function buildTurnUpperBounds(turns: AgentTurn[], totalMessages: number): number[] {
  let messageIndex = 0;
  return turns.map((turn) => {
    const turnMessageCount =
      (turn.userMessage !== null ? 1 : 0) + turn.assistantMessages.length;
    messageIndex += turnMessageCount;
    return messageIndex;
  });
}

function assignStepsToTurns(
  turns: AgentTurn[],
  steps: AgentStep[],
  totalMessages: number
): void {
  if (turns.length === 0) return;

  const upperBounds = buildTurnUpperBounds(turns, totalMessages);
  const FIRST_TURN = 0;
  let turnIdx = FIRST_TURN;

  for (const step of steps) {
    // Advance turn pointer while the step's order exceeds the current turn's upper bound
    while (
      turnIdx < turns.length - 1 &&
      step.stepOrder >= upperBounds[turnIdx]!
    ) {
      turnIdx++;
    }
    const target = turns[turnIdx];
    if (target !== undefined) {
      target.steps.push(step);
    }
  }
}

export function groupTurnsAndSteps(
  messages: ExecutionMessageRow[],
  visits: NodeVisitRow[]
): AgentDebugData {
  const steps = buildStepsFromVisits(visits);
  const messageGroups = splitByUserMessages(messages);
  const turns = messageGroups.map((g, i) => buildTurnFromGroup(g, i));

  assignStepsToTurns(turns, steps, messages.length);

  return { turns, totalSteps: steps.length };
}
```

- [ ] **Step 3: Verify types compile**

```bash
npm run typecheck -w packages/web
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/dashboard/agent-debug/agentDebugTypes.ts packages/web/app/components/dashboard/agent-debug/turnGrouping.ts
git commit -m "feat: add turn/step grouping logic for agent debug view"
```

---

## Task 5: StepCard Component

**Files:**
- Create: `packages/web/app/components/dashboard/agent-debug/StepCard.tsx`

- [ ] **Step 1: Create StepCard component**

Create `packages/web/app/components/dashboard/agent-debug/StepCard.tsx`:

```ts
'use client';

import { TokenDisplay } from '@/app/components/panels/simulation/TokenDisplay';
import type { NodeVisitRow } from '@/app/lib/dashboard';
import { Brain, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AgentStep } from './agentDebugTypes';

interface StepCardProps {
  step: AgentStep;
  isSelected: boolean;
  onSelect: (step: AgentStep) => void;
}

function visitToTokens(visit: NodeVisitRow) {
  return {
    input: visit.input_tokens,
    output: visit.output_tokens,
    cached: visit.cached_tokens,
    costUSD: visit.cost,
  };
}

function StepHeader({ step }: { step: AgentStep }) {
  const t = useTranslations('dashboard.agentDebug');

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold font-mono">
        {t('stepN', { n: step.stepOrder })}
      </span>
      <span className="text-[10px] text-muted-foreground/40">|</span>
      <span className="inline-flex items-center font-mono text-[10px] text-muted-foreground">
        <Brain className="mr-0.5 size-2.5" />
        {step.visit.model}
      </span>
    </div>
  );
}

export function StepCard({ step, isSelected, onSelect }: StepCardProps) {
  const selectedClass = isSelected ? 'ring-1 ring-primary/50 bg-primary/5' : 'hover:bg-muted/50';

  return (
    <button
      type="button"
      onClick={() => onSelect(step)}
      className={`flex w-full items-center justify-between rounded-md border p-2.5 text-left transition-colors ${selectedClass}`}
    >
      <div className="flex flex-col gap-1">
        <StepHeader step={step} />
        <TokenDisplay tokens={visitToTokens(step.visit)} durationMs={step.visit.duration_ms} />
      </div>
      <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
    </button>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
npm run typecheck -w packages/web
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/dashboard/agent-debug/StepCard.tsx
git commit -m "feat: add StepCard component for agent debug view"
```

---

## Task 5b: ToolCallDisplay Component

**Files:**
- Create: `packages/web/app/components/dashboard/agent-debug/ToolCallDisplay.tsx`

The spec requires "Tool calls shown inline with their results." This component renders a tool call's name, arguments (formatted JSON), and result within the chat timeline.

- [ ] **Step 1: Create ToolCallDisplay component**

Create `packages/web/app/components/dashboard/agent-debug/ToolCallDisplay.tsx`:

```ts
'use client';

import type { ExecutionMessageRow } from '@/app/lib/dashboard';
import { Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ToolCallDisplayProps {
  message: ExecutionMessageRow;
  resultMessage: ExecutionMessageRow | null;
}

interface ToolCallEntry {
  id: string;
  name: string;
  arguments: string;
}

function parseToolCalls(toolCalls: unknown): ToolCallEntry[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls
    .filter(
      (tc): tc is Record<string, unknown> =>
        typeof tc === 'object' && tc !== null
    )
    .map((tc) => ({
      id: typeof tc['id'] === 'string' ? tc['id'] : '',
      name:
        typeof tc['function'] === 'object' &&
        tc['function'] !== null &&
        typeof (tc['function'] as Record<string, unknown>)['name'] === 'string'
          ? ((tc['function'] as Record<string, unknown>)['name'] as string)
          : 'unknown',
      arguments:
        typeof tc['function'] === 'object' &&
        tc['function'] !== null &&
        typeof (tc['function'] as Record<string, unknown>)['arguments'] === 'string'
          ? ((tc['function'] as Record<string, unknown>)['arguments'] as string)
          : '{}',
    }));
}

function formatArguments(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    return args;
  }
}

function extractResultText(msg: ExecutionMessageRow | null): string | null {
  if (msg === null) return null;
  if (typeof msg.content === 'string') return msg.content;
  if (typeof msg.content === 'object' && msg.content !== null) {
    const rec = msg.content as Record<string, unknown>;
    if (typeof rec['text'] === 'string') return rec['text'];
  }
  return JSON.stringify(msg.content);
}

function ToolCallEntryCard({ entry, result }: { entry: ToolCallEntry; result: string | null }) {
  const t = useTranslations('dashboard.agentDebug');

  return (
    <div className="rounded-md border bg-muted/30 p-2.5 text-xs">
      <div className="flex items-center gap-1.5 font-semibold font-mono">
        <Wrench className="size-3 text-muted-foreground" />
        {entry.name}
      </div>
      <div className="mt-1.5">
        <span className="text-[10px] uppercase text-muted-foreground font-semibold">
          {t('toolCallArgs')}
        </span>
        <pre className="mt-0.5 whitespace-pre-wrap break-all text-[11px] text-muted-foreground font-mono">
          {formatArguments(entry.arguments)}
        </pre>
      </div>
      {result !== null && (
        <div className="mt-1.5">
          <span className="text-[10px] uppercase text-muted-foreground font-semibold">
            {t('toolCallResult')}
          </span>
          <pre className="mt-0.5 whitespace-pre-wrap break-all text-[11px] text-muted-foreground font-mono">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ToolCallDisplay({ message, resultMessage }: ToolCallDisplayProps) {
  const entries = parseToolCalls(message.tool_calls);
  if (entries.length === 0) return null;

  const result = extractResultText(resultMessage);

  return (
    <div className="ml-8 flex flex-col gap-1.5">
      {entries.map((entry) => (
        <ToolCallEntryCard key={entry.id} entry={entry} result={result} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
npm run typecheck -w packages/web
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/dashboard/agent-debug/ToolCallDisplay.tsx
git commit -m "feat: add ToolCallDisplay component for inline tool call rendering"
```

---

## Task 6: TurnGroup Component

**Files:**
- Create: `packages/web/app/components/dashboard/agent-debug/TurnGroup.tsx`

- [ ] **Step 1: Create TurnGroup component**

Create `packages/web/app/components/dashboard/agent-debug/TurnGroup.tsx`:

```ts
'use client';

import type { ExecutionMessageRow } from '@/app/lib/dashboard';
import { Bot, User } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AgentStep, AgentTurn } from './agentDebugTypes';
import { StepCard } from './StepCard';
import { ToolCallDisplay } from './ToolCallDisplay';

interface TurnGroupProps {
  turn: AgentTurn;
  selectedStepOrder: number | null;
  onSelectStep: (step: AgentStep) => void;
}

function extractMessageText(msg: ExecutionMessageRow): string {
  if (typeof msg.content === 'string') return msg.content;
  if (typeof msg.content === 'object' && msg.content !== null) {
    const rec = msg.content as Record<string, unknown>;
    if (typeof rec['text'] === 'string') return rec['text'];
  }
  return JSON.stringify(msg.content);
}

function hasToolCalls(msg: ExecutionMessageRow): boolean {
  return Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
}

function findToolResult(
  messages: ExecutionMessageRow[],
  afterIndex: number,
  toolCallId: string | null
): ExecutionMessageRow | null {
  if (toolCallId === null) return null;
  for (let i = afterIndex + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m !== undefined && m.role === 'tool' && m.tool_call_id === toolCallId) {
      return m;
    }
  }
  return null;
}

function UserMessageBubble({ message }: { message: ExecutionMessageRow }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <User className="size-3 text-primary" />
      </div>
      <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2 text-xs">
        {extractMessageText(message)}
      </div>
    </div>
  );
}

function AssistantMessageBubble({ message }: { message: ExecutionMessageRow }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="size-3 text-muted-foreground" />
      </div>
      <div className="rounded-lg border bg-card px-3 py-2 text-xs">
        {extractMessageText(message)}
      </div>
    </div>
  );
}

function TurnSteps({ turn, selectedStepOrder, onSelectStep }: TurnGroupProps) {
  if (turn.steps.length === 0) return null;

  return (
    <div className="ml-8 flex flex-col gap-1.5">
      {turn.steps.map((step) => (
        <StepCard
          key={step.stepOrder}
          step={step}
          isSelected={selectedStepOrder === step.stepOrder}
          onSelect={onSelectStep}
        />
      ))}
    </div>
  );
}

function TurnHeader({ turnIndex }: { turnIndex: number }) {
  const t = useTranslations('dashboard.agentDebug');
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-medium uppercase text-muted-foreground">
        {t('turnN', { n: turnIndex + 1 })}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function AssistantMessageWithToolCalls({
  msg,
  index,
  allMessages,
}: {
  msg: ExecutionMessageRow;
  index: number;
  allMessages: ExecutionMessageRow[];
}) {
  const firstToolCallId =
    Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0
      ? ((msg.tool_calls[0] as Record<string, unknown>)?.['id'] as string | undefined) ?? null
      : null;

  return (
    <>
      <AssistantMessageBubble message={msg} />
      {hasToolCalls(msg) && (
        <ToolCallDisplay
          message={msg}
          resultMessage={findToolResult(allMessages, index, firstToolCallId)}
        />
      )}
    </>
  );
}

export function TurnGroup({ turn, selectedStepOrder, onSelectStep }: TurnGroupProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <TurnHeader turnIndex={turn.turnIndex} />
      {turn.userMessage !== null && <UserMessageBubble message={turn.userMessage} />}
      <TurnSteps turn={turn} selectedStepOrder={selectedStepOrder} onSelectStep={onSelectStep} />
      {turn.assistantMessages.map((msg, idx) => (
        <AssistantMessageWithToolCalls
          key={msg.id}
          msg={msg}
          index={idx}
          allMessages={turn.assistantMessages}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
npm run typecheck -w packages/web
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/dashboard/agent-debug/TurnGroup.tsx
git commit -m "feat: add TurnGroup component for agent debug view"
```

---

## Task 7: AgentChatTimeline Component

**Files:**
- Create: `packages/web/app/components/dashboard/agent-debug/AgentChatTimeline.tsx`

- [ ] **Step 1: Create AgentChatTimeline component**

Create `packages/web/app/components/dashboard/agent-debug/AgentChatTimeline.tsx`:

```ts
'use client';

import { useTranslations } from 'next-intl';

import type { AgentDebugData, AgentStep } from './agentDebugTypes';
import { TurnGroup } from './TurnGroup';

interface AgentChatTimelineProps {
  debugData: AgentDebugData;
  selectedStepOrder: number | null;
  onSelectStep: (step: AgentStep) => void;
}

function EmptyTimeline({ message }: { message: string }) {
  return (
    <p className="text-xs text-muted-foreground bg-card p-3 rounded-md border border-secondary/10">
      {message}
    </p>
  );
}

export function AgentChatTimeline({ debugData, selectedStepOrder, onSelectStep }: AgentChatTimelineProps) {
  const t = useTranslations('dashboard.agentDebug');

  if (debugData.turns.length === 0) {
    return <EmptyTimeline message={t('noMessages')} />;
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto">
      {debugData.turns.map((turn) => (
        <TurnGroup
          key={turn.turnIndex}
          turn={turn}
          selectedStepOrder={selectedStepOrder}
          onSelectStep={onSelectStep}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
npm run typecheck -w packages/web
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/dashboard/agent-debug/AgentChatTimeline.tsx
git commit -m "feat: add AgentChatTimeline component"
```

---

## Task 8: StepInspector Component

**Files:**
- Create: `packages/web/app/components/dashboard/agent-debug/StepInspector.tsx`

- [ ] **Step 1: Create StepInspector component**

Create `packages/web/app/components/dashboard/agent-debug/StepInspector.tsx`:

```ts
'use client';

import { TokenDisplay } from '@/app/components/panels/simulation/TokenDisplay';
import { MessageCards } from '@/app/components/dashboard/node-inspector/MessageCards';
import { ResponseSection } from '@/app/components/dashboard/node-inspector/ResponseSection';
import { Brain } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AgentStep } from './agentDebugTypes';

interface StepInspectorProps {
  step: AgentStep | null;
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-xs text-muted-foreground bg-card p-3 rounded-md border border-secondary/10">
      {message}
    </p>
  );
}

function stepToTokens(step: AgentStep) {
  return {
    input: step.visit.input_tokens,
    output: step.visit.output_tokens,
    cached: step.visit.cached_tokens,
    costUSD: step.visit.cost,
  };
}

function StepHeader({ step }: { step: AgentStep }) {
  const t = useTranslations('dashboard.agentDebug');

  return (
    <div>
      <span className="text-sm font-semibold font-mono">
        {t('stepN', { n: step.stepOrder })}
      </span>
      <div className="mt-1 flex items-center gap-2">
        <TokenDisplay tokens={stepToTokens(step)} durationMs={step.visit.duration_ms} />
        <span className="text-[10px] text-muted-foreground/40">|</span>
        <span className="inline-flex items-center font-mono text-[10px] text-muted-foreground">
          <Brain className="mr-0.5 size-2.5" />
          {step.visit.model}
        </span>
      </div>
    </div>
  );
}

export function StepInspector({ step }: StepInspectorProps) {
  const t = useTranslations('dashboard.agentDebug');

  if (step === null) {
    return <EmptyState message={t('selectStep')} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <StepHeader step={step} />
      <MessageCards data={step.visit.messages_sent} />
      <ResponseSection visit={step.visit} />
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
npm run typecheck -w packages/web
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/dashboard/agent-debug/StepInspector.tsx
git commit -m "feat: add StepInspector component for agent debug view"
```

---

## Task 8b: Extract ExecutionErrorBanner to Shared File

**Files:**
- Create: `packages/web/app/components/dashboard/debug-view/ExecutionErrorBanner.tsx`
- Modify: `packages/web/app/components/dashboard/DebugView.tsx`

The `ExecutionErrorBanner` component currently lives inside `DebugView.tsx`. Extract it to a shared file so both `DebugView` and the new `AgentDebugView` can import it without duplication.

- [ ] **Step 1: Create the shared ExecutionErrorBanner component**

Create `packages/web/app/components/dashboard/debug-view/ExecutionErrorBanner.tsx`:

```ts
import type { ExecutionSummaryRow } from '@/app/lib/dashboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface ExecutionErrorBannerProps {
  execution: ExecutionSummaryRow;
  label: string;
}

export function ExecutionErrorBanner({ execution, label }: ExecutionErrorBannerProps) {
  if (execution.status !== 'failed' || execution.error === null || execution.error === '') {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{label}</AlertTitle>
      <AlertDescription>{execution.error}</AlertDescription>
    </Alert>
  );
}
```

- [ ] **Step 2: Update DebugView.tsx to import from the shared file**

In `packages/web/app/components/dashboard/DebugView.tsx`:

Remove the local `ExecutionErrorBanner` function and the `Alert`, `AlertDescription`, `AlertTitle`, and `AlertCircle` imports that are only used by it. Add the import:

```ts
import { ExecutionErrorBanner } from './debug-view/ExecutionErrorBanner';
```

- [ ] **Step 3: Verify types compile**

```bash
npm run typecheck -w packages/web
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/dashboard/debug-view/ExecutionErrorBanner.tsx packages/web/app/components/dashboard/DebugView.tsx
git commit -m "refactor: extract ExecutionErrorBanner to shared debug-view file"
```

---

## Task 9: AgentDebugView Component

**Files:**
- Create: `packages/web/app/components/dashboard/agent-debug/useAgentDebugState.ts`
- Create: `packages/web/app/components/dashboard/AgentDebugView.tsx`

- [ ] **Step 1: Create the state hook**

Create `packages/web/app/components/dashboard/agent-debug/useAgentDebugState.ts`:

```ts
'use client';

import { fetchMessagesForExecution, fetchNodeVisitsForExecution } from '@/app/actions/dashboard';
import type { ExecutionMessageRow, ExecutionSummaryRow, NodeVisitRow } from '@/app/lib/dashboard';
import { useCallback, useMemo, useState, useTransition } from 'react';

import type { AgentDebugData, AgentStep } from './agentDebugTypes';
import { groupTurnsAndSteps } from './turnGrouping';

const FIRST_INDEX = 0;

interface AgentDebugStateInput {
  executions: ExecutionSummaryRow[];
  initialNodeVisits: NodeVisitRow[];
  initialMessages: ExecutionMessageRow[];
}

interface AgentDebugState {
  selectedExecutionId: string;
  nodeVisits: NodeVisitRow[];
  messages: ExecutionMessageRow[];
  selectedStep: AgentStep | null;
  debugData: AgentDebugData;
  selectedExecution: ExecutionSummaryRow | undefined;
  handleSelectExecution: (executionId: string) => void;
  handleSelectStep: (step: AgentStep) => void;
  handleDeselectStep: () => void;
}

function findExecution(
  executions: ExecutionSummaryRow[],
  id: string
): ExecutionSummaryRow | undefined {
  return executions.find((e) => e.id === id);
}

export function useAgentDebugState(input: AgentDebugStateInput): AgentDebugState {
  const { executions, initialNodeVisits, initialMessages } = input;
  const firstExecution = executions[FIRST_INDEX];

  const [selectedExecutionId, setSelectedExecutionId] = useState(firstExecution?.id ?? '');
  const [nodeVisits, setNodeVisits] = useState<NodeVisitRow[]>(initialNodeVisits);
  const [messages, setMessages] = useState<ExecutionMessageRow[]>(initialMessages);
  const [selectedStep, setSelectedStep] = useState<AgentStep | null>(null);
  const [, startTransition] = useTransition();

  const handleSelectExecution = useCallback(
    (executionId: string) => {
      setSelectedExecutionId(executionId);
      setSelectedStep(null);

      startTransition(async () => {
        const [visitsResult, msgsResult] = await Promise.all([
          fetchNodeVisitsForExecution(executionId),
          fetchMessagesForExecution(executionId),
        ]);
        setNodeVisits(visitsResult.rows);
        setMessages(msgsResult.rows);
      });
    },
    [startTransition]
  );

  const handleSelectStep = useCallback((step: AgentStep) => {
    setSelectedStep(step);
  }, []);

  const handleDeselectStep = useCallback(() => {
    setSelectedStep(null);
  }, []);

  const debugData = useMemo(
    () => groupTurnsAndSteps(messages, nodeVisits),
    [messages, nodeVisits]
  );

  const selectedExecution = useMemo(
    () => findExecution(executions, selectedExecutionId),
    [executions, selectedExecutionId]
  );

  return {
    selectedExecutionId,
    nodeVisits,
    messages,
    selectedStep,
    debugData,
    selectedExecution,
    handleSelectExecution,
    handleSelectStep,
    handleDeselectStep,
  };
}
```

- [ ] **Step 2: Create the AgentDebugView component**

Create `packages/web/app/components/dashboard/AgentDebugView.tsx`:

```ts
'use client';

import type { ExecutionMessageRow, ExecutionSummaryRow, NodeVisitRow, SessionRow } from '@/app/lib/dashboard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useTranslations } from 'next-intl';

import { AgentChatTimeline } from './agent-debug/AgentChatTimeline';
import { StepInspector } from './agent-debug/StepInspector';
import { useAgentDebugState } from './agent-debug/useAgentDebugState';
import { DebugBreadcrumb } from './debug-view/DebugBreadcrumb';
import { ExecutionErrorBanner } from './debug-view/ExecutionErrorBanner';
import { SessionMetadataBar } from './debug-view/SessionMetadataBar';

interface AgentDebugViewProps {
  session: SessionRow;
  executions: ExecutionSummaryRow[];
  initialNodeVisits: NodeVisitRow[];
  initialMessages: ExecutionMessageRow[];
  orgSlug: string;
  agentName: string;
  breadcrumbLabel: string;
  breadcrumbSlug: string;
}

interface ExecutionSelectorProps {
  executions: ExecutionSummaryRow[];
  selectedExecutionId: string;
  onSelectExecution: (executionId: string) => void;
}

function ExecutionSelector({ executions, selectedExecutionId, onSelectExecution }: ExecutionSelectorProps) {
  const t = useTranslations('dashboard.debug');

  if (executions.length <= 1) return null;

  return (
    <div className="px-4 py-2">
      <Select value={selectedExecutionId} onValueChange={onSelectExecution}>
        <SelectTrigger className="w-[220px] h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {executions.map((exec, idx) => (
            <SelectItem key={exec.id} value={exec.id} className="text-xs">
              {t('executionN', { n: idx + 1 })} - {exec.status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AgentDebugHeader(props: {
  orgSlug: string;
  agentName: string;
  agentSlug: string;
  sessionId: string;
  dashboardLabel: string;
}) {
  return (
    <>
      <div className="px-4 py-3 shrink-0 bg-background">
        <DebugBreadcrumb
          slug={props.orgSlug}
          agentName={props.agentName}
          agentSlug={props.agentSlug}
          sessionId={props.sessionId}
          dashboardLabel={props.dashboardLabel}
        />
      </div>
      <Separator />
    </>
  );
}

function AgentDebugPanels(props: AgentDebugViewProps) {
  const t = useTranslations('dashboard');

  const state = useAgentDebugState({
    executions: props.executions,
    initialNodeVisits: props.initialNodeVisits,
    initialMessages: props.initialMessages,
  });

  return (
    <div className="px-0 pb-3 flex flex-col gap-0 flex-1 min-h-[0px]">
      <SessionMetadataBar session={props.session} agentName={props.agentName} />
      <Separator />
      <ExecutionSelector
        executions={props.executions}
        selectedExecutionId={state.selectedExecutionId}
        onSelectExecution={state.handleSelectExecution}
      />
      {state.selectedExecution !== undefined && (
        <div className="px-4">
          <ExecutionErrorBanner execution={state.selectedExecution} label={t('debug.executionError')} />
        </div>
      )}
      <div className="px-4 pt-4 flex flex-1 gap-4 min-h-0">
        <div className="w-1/2 overflow-y-auto">
          <AgentChatTimeline
            debugData={state.debugData}
            selectedStepOrder={state.selectedStep?.stepOrder ?? null}
            onSelectStep={state.handleSelectStep}
          />
        </div>
        <div className="w-1/2 overflow-y-auto">
          <StepInspector step={state.selectedStep} />
        </div>
      </div>
    </div>
  );
}

export function AgentDebugView(props: AgentDebugViewProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="flex h-full flex-col bg-background">
      <AgentDebugHeader
        orgSlug={props.orgSlug}
        agentName={props.breadcrumbLabel}
        agentSlug={props.breadcrumbSlug}
        sessionId={props.session.session_id}
        dashboardLabel={t('title')}
      />
      <AgentDebugPanels {...props} />
    </div>
  );
}
```

- [ ] **Step 3: Verify types compile**

```bash
npm run typecheck -w packages/web
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/dashboard/agent-debug/useAgentDebugState.ts packages/web/app/components/dashboard/AgentDebugView.tsx
git commit -m "feat: add AgentDebugView with chat timeline and step inspector"
```

---

## Task 10: Dashboard Page Routing (Workflow vs Agent Debug View)

**Files:**
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/dashboard/[tenantId]/sessions/[sessionId]/page.tsx`

The session page must check the agent's `app_type` and conditionally render either the existing `DebugView` (for workflows) or the new `AgentDebugView` (for agents). Since the `app_type` field is being added by Sub-project 1 (app-types plan), we need to handle the case where it might not exist yet by defaulting to `'workflow'`.

- [ ] **Step 1: Add AgentDebugView import and message-fetching helper**

Add the import at the top:

```ts
import { AgentDebugView } from '@/app/components/dashboard/AgentDebugView';
import { getMessagesForExecution } from '@/app/lib/dashboard';
```

Add a helper function to fetch initial messages (alongside the existing `fetchInitialNodeVisits`):

```ts
async function fetchInitialMessages(executionId: string | undefined) {
  if (executionId === undefined) return [];
  const { rows } = await getMessagesForExecution(executionId);
  return rows;
}
```

- [ ] **Step 2: Determine app_type from the agent and fetch messages**

After `const agent = await resolveAgentById(org.id, session.agent_id);` and the redirect check, add the app type detection:

```ts
const appType: string = typeof (agent as Record<string, unknown>).app_type === 'string'
  ? (agent as Record<string, unknown>).app_type as string
  : 'workflow';
```

Update the `Promise.all` that fetches graph + node visits to also conditionally fetch messages:

```ts
const isAgentApp = appType === 'agent';

const [graphRaw, initialNodeVisits, initialMessages] = await Promise.all([
  fetchFromBackend('GET', `/agents/${agent.id}/versions/${String(session.version)}`),
  fetchInitialNodeVisits(firstExecution?.id),
  isAgentApp ? fetchInitialMessages(firstExecution?.id) : Promise.resolve([]),
]);
```

- [ ] **Step 3: Conditionally render the appropriate debug view**

Replace the existing return statement with:

```ts
if (isAgentApp) {
  return (
    <AgentDebugView
      session={session}
      executions={executions}
      initialNodeVisits={initialNodeVisits}
      initialMessages={initialMessages}
      orgSlug={slug}
      agentName={agent.name}
      breadcrumbLabel={tenantId}
      breadcrumbSlug={encodeURIComponent(tenantId)}
    />
  );
}

// Only parse graph schema for workflow apps — agent-type apps may not conform to the Graph schema
const graph: Graph = GraphSchema.parse(graphRaw);

return (
  <DebugView
    session={session}
    executions={executions}
    initialNodeVisits={initialNodeVisits}
    graph={graph}
    orgSlug={slug}
    agentName={agent.name}
    breadcrumbLabel={tenantId}
    breadcrumbSlug={encodeURIComponent(tenantId)}
  />
);
```

Note: The page file may exceed 300 lines with these additions. If it does, extract the agent-specific data loading into a helper file `packages/web/app/orgs/[slug]/(dashboard)/dashboard/[tenantId]/sessions/[sessionId]/agentDebugHelpers.ts` containing `fetchInitialMessages`, `resolveAgentById`, and the conditional rendering logic.

- [ ] **Step 4: Verify types compile**

```bash
npm run typecheck -w packages/web
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/dashboard/\[tenantId\]/sessions/\[sessionId\]/page.tsx
git commit -m "feat: route debug view based on agent app_type (workflow vs agent)"
```

---

## Task 11: Translations

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add agentDebug translations**

Add the following block inside the `"dashboard"` object, after the existing `"debug"` block (after the closing `}` of `"debug"`):

```json
"agentDebug": {
  "turnN": "Turn {n}",
  "stepN": "Step {n}",
  "selectStep": "Click a step to inspect its full LLM request and response.",
  "noMessages": "No messages found for this execution.",
  "chatTimeline": "Chat Timeline",
  "stepInspector": "Step Inspector",
  "totalSteps": "Total Steps",
  "toolCallArgs": "Arguments",
  "toolCallResult": "Result"
}
```

- [ ] **Step 2: Verify the JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/web/messages/en.json', 'utf-8')); console.log('valid')"
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat: add agent debug view translations"
```

---

## Task 12: Full Check

- [ ] **Step 1: Run the full check suite**

```bash
npm run check
```

- [ ] **Step 2: Fix any issues**

If the check reveals lint, format, or type errors, fix them following the established patterns:
- Extract helper functions for `max-lines-per-function` violations
- Split files for `max-lines` violations
- Never add eslint-disable comments
- Never use `any` type

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve lint/type issues from agent debug implementation"
```
