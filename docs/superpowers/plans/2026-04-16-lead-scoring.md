# Lead Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `set_lead_score` and `get_lead_score` system tools that persist scores on conversation metadata, with realistic simulation behavior and dashboard visibility.

**Architecture:** New `metadata jsonb` column on `conversations` table. Tools are system-injected (like composition tools) via a `LeadScoringServices` callback interface. Production path uses Supabase; simulation path uses in-memory + `context.data` for cross-turn persistence. Frontend captures scores from tool call events and feeds them back via `data` on subsequent simulation requests.

**Tech Stack:** Supabase (Postgres, Edge Functions), `@daviddh/llm-graph-runner` (AI SDK tools), Next.js, React, Tailwind, next-intl

---

## File Map

### New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260416100000_conversation_metadata.sql` | Add `metadata jsonb` column |
| `packages/api/src/tools/leadScoringTools.ts` | Tool factories + `LeadScoringServices` interface |

### Modified Files

| File | Change |
|------|--------|
| `packages/api/src/tools/toolEnum.ts` | Add `setLeadScore`, `getLeadScore` enum values |
| `packages/api/src/tools/systemToolInjector.ts` | Accept `LeadScoringServices`, inject lead scoring tools, add to reserved names |
| `packages/api/src/index.ts` | Export `LeadScoringServices` type and tool name constants |
| `packages/backend/src/messaging/types/index.ts` | Add `metadata` to `ConversationRow` and `ConversationSnapshot` |
| `packages/backend/src/messaging/controllers/snapshotBuilder.ts` | Pass `metadata` through to snapshot |
| `packages/backend/src/messaging/queries/conversationMutations.ts` | Add `updateConversationMetadata` and `getConversationMetadata` functions |
| `packages/backend/src/routes/execute/edgeFunctionClient.ts` | Add `conversationId` to `ExecuteAgentParams` |
| `packages/backend/src/routes/execute/executeCoreHelpers.ts` | Pass `conversationId` into edge params |
| `packages/backend/src/routes/execute/executeCore.ts` | Thread `conversationId` through to params builder |
| `supabase/functions/execute-agent/index.ts` | Create Supabase client for lead scoring, build services, pass to `injectSystemTools` |
| `packages/web/app/lib/toolRegistry.ts` | Add "OpenFlow/LeadScoring" group with both tools |
| `packages/web/app/types/chat.ts` | Add `metadata` to `LastMessage` |
| `packages/web/app/components/messages/shared/messagePreview/index.tsx` | Show lead score badge |
| `packages/web/app/hooks/useSimulationHelpers.ts` | Capture `set_lead_score` results, feed into `data` |
| `packages/web/messages/en.json` | Add `"Lead score"` translation |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260416100000_conversation_metadata.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add metadata JSONB column to conversations table
ALTER TABLE conversations ADD COLUMN metadata jsonb DEFAULT NULL;

-- Index for querying by lead_score (supports dashboard sorting)
CREATE INDEX idx_conversations_lead_score
  ON conversations ((metadata->>'lead_score'))
  WHERE metadata IS NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260416100000_conversation_metadata.sql
git commit -m "feat(db): add metadata jsonb column to conversations"
```

---

### Task 2: Backend Types — Add `metadata` to Conversation Types

**Files:**
- Modify: `packages/backend/src/messaging/types/index.ts`

- [ ] **Step 1: Add `metadata` to `ConversationRow`**

In `ConversationRow`, add after the `last_original_id` field:

```typescript
  metadata: Record<string, unknown> | null;
```

- [ ] **Step 2: Add `metadata` to `ConversationSnapshot`**

In `ConversationSnapshot`, add after the `statuses` field:

```typescript
  metadata: Record<string, unknown> | null;
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/messaging/types/index.ts
git commit -m "feat(backend): add metadata field to ConversationRow and ConversationSnapshot"
```

---

### Task 3: Backend — Pass `metadata` Through Snapshot Builder

**Files:**
- Modify: `packages/backend/src/messaging/controllers/snapshotBuilder.ts`

- [ ] **Step 1: Add `metadata` to `conversationToSnapshot` return**

In the `conversationToSnapshot` function, add after the `statuses` line:

```typescript
    metadata: row.metadata ?? null,
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/messaging/controllers/snapshotBuilder.ts
git commit -m "feat(backend): pass metadata through conversation snapshot builder"
```

---

### Task 4: Backend — Add Conversation Metadata Query Functions

**Files:**
- Modify: `packages/backend/src/messaging/queries/conversationMutations.ts`

- [ ] **Step 1: Add `updateConversationMetadata` function**

Add at the end of the file:

```typescript
/* ─── Update conversation metadata (JSONB merge) ─── */

export async function updateConversationMetadata(
  supabase: SupabaseClient,
  conversationId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const existing = await getConversationMetadata(supabase, conversationId);
  const merged = { ...existing, ...metadata };

  const result = await supabase
    .from('conversations')
    .update({ metadata: merged })
    .eq('id', conversationId);

  if (result.error !== null) {
    throw new Error(`updateConversationMetadata: ${result.error.message}`);
  }
}

/* ─── Get conversation metadata ─── */

export async function getConversationMetadata(
  supabase: SupabaseClient,
  conversationId: string
): Promise<Record<string, unknown> | null> {
  const result: QueryResult<{ metadata: Record<string, unknown> | null }> = await supabase
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();

  if (result.error !== null || result.data === null) return null;
  return result.data.metadata;
}
```

- [ ] **Step 2: Add `QueryResult` import**

The file already imports `SupabaseClient`. Add the `QueryResult` import:

```typescript
import type { QueryResult } from './queryHelpers.js';
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/messaging/queries/conversationMutations.ts
git commit -m "feat(backend): add updateConversationMetadata and getConversationMetadata queries"
```

---

### Task 5: API Package — Add Tool Enum Values

**Files:**
- Modify: `packages/api/src/tools/toolEnum.ts`

- [ ] **Step 1: Add lead scoring enum values**

```typescript
export enum CloserTool {
  // Greeting
  addUserName = 'addUserName',
  // Lead Scoring
  setLeadScore = 'set_lead_score',
  getLeadScore = 'get_lead_score',
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/tools/toolEnum.ts
git commit -m "feat(api): add lead scoring tool enum values"
```

---

### Task 6: API Package — Create Lead Scoring Tools

**Files:**
- Create: `packages/api/src/tools/leadScoringTools.ts`

- [ ] **Step 1: Create the lead scoring tools module**

```typescript
import type { Tool } from 'ai';
import { zodSchema } from 'ai';
import { z } from 'zod';

import { CloserTool } from './toolEnum.js';

/* ─── Services interface ─── */

export interface LeadScoringServices {
  setLeadScore: (score: number) => Promise<void>;
  getLeadScore: () => Promise<number | null>;
}

/* ─── Tool name constants ─── */

export const SET_LEAD_SCORE_TOOL_NAME = CloserTool.setLeadScore;
export const GET_LEAD_SCORE_TOOL_NAME = CloserTool.getLeadScore;

/* ─── Schemas ─── */

const MIN_SCORE = 0;
const MAX_SCORE = 100;

const setLeadScoreSchema = z.object({
  score: z
    .number()
    .int()
    .min(MIN_SCORE)
    .max(MAX_SCORE)
    .describe('Lead score from 0 to 100'),
});

/* ─── In-memory simulation store ─── */

interface SimulationStore {
  leadScore: number | null;
}

export function createSimulationStore(): SimulationStore {
  return { leadScore: null };
}

/* ─── Tool factories ─── */

function buildSimulationServices(
  store: SimulationStore,
  contextData: Record<string, unknown>
): LeadScoringServices {
  // Read initial score from context.data (cross-turn persistence from frontend)
  const dataScore = contextData['lead_score'];
  if (typeof dataScore === 'number' && store.leadScore === null) {
    store.leadScore = dataScore;
  }
  return {
    setLeadScore: async (score: number) => {
      store.leadScore = score;
    },
    getLeadScore: async () => store.leadScore,
  };
}

interface CreateLeadScoringToolsParams {
  services?: LeadScoringServices;
  contextData?: Record<string, unknown>;
}

export function createLeadScoringTools(
  params: CreateLeadScoringToolsParams
): Record<string, Tool> {
  const { services: externalServices, contextData } = params;

  // Simulation fallback: in-memory store + context.data for cross-turn
  const simStore = createSimulationStore();
  const services =
    externalServices ?? buildSimulationServices(simStore, contextData ?? {});

  return {
    [SET_LEAD_SCORE_TOOL_NAME]: {
      description:
        'Set the lead score for the current conversation. ' +
        'Score must be 0-100. The conversation is identified automatically.',
      inputSchema: zodSchema(setLeadScoreSchema),
      execute: async (args: z.infer<typeof setLeadScoreSchema>) => {
        await services.setLeadScore(args.score);
        return { result: `Lead score set to ${String(args.score)}` };
      },
    } satisfies Tool,
    [GET_LEAD_SCORE_TOOL_NAME]: {
      description:
        'Get the current lead score for this conversation. ' +
        'Returns the score (0-100) or null if not yet scored.',
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        const score = await services.getLeadScore();
        return { result: score !== null ? { lead_score: score } : { lead_score: null } };
      },
    } satisfies Tool,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/tools/leadScoringTools.ts
git commit -m "feat(api): create lead scoring tool factories with simulation fallback"
```

---

### Task 7: API Package — Update System Tool Injector

**Files:**
- Modify: `packages/api/src/tools/systemToolInjector.ts`

- [ ] **Step 1: Add imports**

Add at the top, after existing imports:

```typescript
import {
  GET_LEAD_SCORE_TOOL_NAME,
  type LeadScoringServices,
  SET_LEAD_SCORE_TOOL_NAME,
  createLeadScoringTools,
} from './leadScoringTools.js';
```

- [ ] **Step 2: Add lead scoring names to `RESERVED_TOOL_NAMES`**

```typescript
const RESERVED_TOOL_NAMES = new Set([
  CREATE_AGENT_TOOL_NAME,
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_WORKFLOW_TOOL_NAME,
  FINISH_TOOL_NAME,
  SET_LEAD_SCORE_TOOL_NAME,
  GET_LEAD_SCORE_TOOL_NAME,
]);
```

- [ ] **Step 3: Add `leadScoringServices` and `contextData` to `InjectSystemToolsParams`**

```typescript
interface InjectSystemToolsParams {
  existingTools: Record<string, Tool>;
  isChildAgent: boolean;
  leadScoringServices?: LeadScoringServices;
  contextData?: Record<string, unknown>;
}
```

- [ ] **Step 4: Inject lead scoring tools in `injectSystemTools`**

After the `// Add finish tool` block, add:

```typescript
  // Add lead scoring tools (always available)
  const leadScoringTools = createLeadScoringTools({
    services: params.leadScoringServices,
    contextData: params.contextData,
  });
  Object.assign(systemTools, leadScoringTools);
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/tools/systemToolInjector.ts
git commit -m "feat(api): inject lead scoring tools as system tools"
```

---

### Task 8: API Package — Export New Types

**Files:**
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Add exports**

Add after the existing `injectSystemTools` export:

```typescript
export type { LeadScoringServices } from './tools/leadScoringTools.js';
export {
  SET_LEAD_SCORE_TOOL_NAME,
  GET_LEAD_SCORE_TOOL_NAME,
} from './tools/leadScoringTools.js';
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/index.ts
git commit -m "feat(api): export LeadScoringServices type and tool name constants"
```

---

### Task 9: Backend — Add `conversationId` to Edge Function Params

**Files:**
- Modify: `packages/backend/src/routes/execute/edgeFunctionClient.ts`
- Modify: `packages/backend/src/routes/execute/executeCoreHelpers.ts`
- Modify: `packages/backend/src/routes/execute/executeCore.ts`

- [ ] **Step 1: Add `conversationId` to `ExecuteAgentParams`**

In `edgeFunctionClient.ts`, add to the `ExecuteAgentParams` interface after `isChildAgent`:

```typescript
  conversationId?: string;
```

- [ ] **Step 2: Pass `conversationId` in `buildCoreExecuteParams`**

In `executeCoreHelpers.ts`, in the `buildCoreExecuteParams` function, add to the `base` object after `isFirstMessage`:

```typescript
    conversationId: options.conversationId,
```

And update the `BuildCoreParamsOptions` interface to include:

```typescript
export interface BuildCoreParamsOptions {
  vfsPayload: VfsEdgeFunctionPayload | undefined;
  overrideAgentConfig?: OverrideAgentConfig;
  conversationId?: string;
}
```

- [ ] **Step 3: Thread `conversationId` through `executeAgentCore`**

In `executeCore.ts`, in `executeAgentCore`, pass `conversationId` to `buildCoreExecuteParams` options:

Find the line:
```typescript
  const buildOptions: BuildCoreParamsOptions = {
    vfsPayload,
    overrideAgentConfig: childOverride ?? params.overrideAgentConfig,
  };
```

Replace with:
```typescript
  const buildOptions: BuildCoreParamsOptions = {
    vfsPayload,
    overrideAgentConfig: childOverride ?? params.overrideAgentConfig,
    conversationId: conversationId ?? undefined,
  };
```

Note: `conversationId` is already a local variable from `setupExecution()` return (it's `string | null`).

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/execute/edgeFunctionClient.ts packages/backend/src/routes/execute/executeCoreHelpers.ts packages/backend/src/routes/execute/executeCore.ts
git commit -m "feat(backend): thread conversationId to edge function params"
```

---

### Task 10: Edge Function — Wire Up Lead Scoring Services

**Files:**
- Modify: `supabase/functions/execute-agent/index.ts`

- [ ] **Step 1: Add `conversationId` to `ExecutePayload`**

In the `ExecutePayload` interface, add after `isChildAgent`:

```typescript
  conversationId?: string;
```

- [ ] **Step 2: Add the `buildLeadScoringServices` function**

Add after the `closeMcpClients` function:

```typescript
/* ─── Lead scoring services (production only) ─── */

interface LeadScoringServices {
  setLeadScore: (score: number) => Promise<void>;
  getLeadScore: () => Promise<number | null>;
}

async function buildLeadScoringServices(
  conversationId: string
): Promise<LeadScoringServices> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey);

  return {
    setLeadScore: async (score: number) => {
      const { data: existing } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('id', conversationId)
        .single();
      const currentMetadata =
        existing !== null && typeof existing.metadata === 'object' && existing.metadata !== null
          ? (existing.metadata as Record<string, unknown>)
          : {};
      const merged = { ...currentMetadata, lead_score: score };
      const { error } = await supabase
        .from('conversations')
        .update({ metadata: merged })
        .eq('id', conversationId);
      if (error !== null) {
        log.error(`set_lead_score failed: ${error.message}`);
      }
    },
    getLeadScore: async () => {
      const { data } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('id', conversationId)
        .single();
      if (data === null || data.metadata === null || typeof data.metadata !== 'object') {
        return null;
      }
      const meta = data.metadata as Record<string, unknown>;
      return typeof meta['lead_score'] === 'number' ? meta['lead_score'] : null;
    },
  };
}
```

- [ ] **Step 3: Update `runAgentExecution` to pass services**

In `runAgentExecution`, replace:
```typescript
    tools: injectSystemTools({ existingTools: allTools, isChildAgent: payload.isChildAgent ?? false }),
```
with:
```typescript
    tools: injectSystemTools({
      existingTools: allTools,
      isChildAgent: payload.isChildAgent ?? false,
      leadScoringServices,
      contextData: payload.data,
    }),
```

And update the function signature to accept `leadScoringServices`:

```typescript
async function runAgentExecution(
  payload: ExecutePayload,
  allTools: Record<string, Tool>,
  write: WriteEvent,
  leadScoringServices?: LeadScoringServices
): Promise<void> {
```

- [ ] **Step 4: Update `runWorkflowExecution` to pass services**

In `runWorkflowExecution`, replace:
```typescript
      toolsOverride: injectSystemTools({ existingTools: allTools, isChildAgent: false }),
```
with:
```typescript
      toolsOverride: injectSystemTools({
        existingTools: allTools,
        isChildAgent: false,
        leadScoringServices,
        contextData: payload.data,
      }),
```

And update the function signature:

```typescript
async function runWorkflowExecution(
  payload: ExecutePayload,
  allTools: Record<string, Tool>,
  write: WriteEvent,
  leadScoringServices?: LeadScoringServices
): Promise<void> {
```

- [ ] **Step 5: Build services in main handler and pass to execution**

In the `Deno.serve` handler, inside the `try` block, after the MCP validation and VFS bootstrap, add before the `if (isAgent)` block:

```typescript
        // Build lead scoring services when we have a real conversation
        const leadScoringServices = payload.conversationId !== undefined
          ? await buildLeadScoringServices(payload.conversationId)
          : undefined;
```

Then update both calls:
```typescript
        if (isAgent) {
          await runAgentExecution(payload, allTools, write, leadScoringServices);
        } else {
          await runWorkflowExecution(payload, allTools, write, leadScoringServices);
        }
```

- [ ] **Step 6: Add `injectSystemTools` import update**

The edge function already imports `injectSystemTools` from `@daviddh/llm-graph-runner`. After the API package changes, the updated function signature will be available. No import changes needed — but verify the edge function's `deno.json` points to the local package so it picks up the change.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/execute-agent/index.ts
git commit -m "feat(edge): wire lead scoring services with Supabase in edge function"
```

---

### Task 11: Web — Add Lead Scoring Tools to Tool Registry

**Files:**
- Modify: `packages/web/app/lib/toolRegistry.ts`

- [ ] **Step 1: Add lead scoring server constants and tools**

After the `SYSTEM_SERVER_NAME` constant, add:

```typescript
const LEAD_SCORING_SERVER_ID = '__lead_scoring__';
const LEAD_SCORING_SERVER_NAME = 'OpenFlow/LeadScoring';
```

After the `SYSTEM_TOOLS` array, add:

```typescript
const LEAD_SCORING_TOOLS: RegistryTool[] = [
  {
    sourceId: LEAD_SCORING_SERVER_ID,
    group: LEAD_SCORING_SERVER_NAME,
    name: 'set_lead_score',
    description: 'Set the lead score for the current conversation. Score must be 0-100.',
    inputSchema: {
      type: 'object',
      properties: {
        score: {
          type: 'number',
          description: 'Lead score from 0 to 100',
          minimum: 0,
          maximum: 100,
        },
      },
      required: ['score'],
    },
  },
  {
    sourceId: LEAD_SCORING_SERVER_ID,
    group: LEAD_SCORING_SERVER_NAME,
    name: 'get_lead_score',
    description:
      'Get the current lead score for this conversation. Returns the score (0-100) or null.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
```

- [ ] **Step 2: Include in `buildToolRegistry`**

Update the `allTools` line in `buildToolRegistry`:

```typescript
  const allTools = [...mcpTools, ...LEAD_SCORING_TOOLS, ...SYSTEM_TOOLS];
```

- [ ] **Step 3: Update `buildGroups` to sort lead scoring with system groups**

Update the `buildGroups` function filter to handle both system groups:

```typescript
  const systemGroupNames = new Set([SYSTEM_SERVER_NAME, LEAD_SCORING_SERVER_NAME]);
  const system = groups.filter((g) => systemGroupNames.has(g.groupName));
  const rest = groups.filter((g) => !systemGroupNames.has(g.groupName));
  rest.sort((a, b) => a.groupName.localeCompare(b.groupName));
  return [...rest, ...system];
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/lib/toolRegistry.ts
git commit -m "feat(web): add OpenFlow/LeadScoring tools to tool registry"
```

---

### Task 12: Web — Add `metadata` to `LastMessage` Type and MessagePreview

**Files:**
- Modify: `packages/web/app/types/chat.ts`
- Modify: `packages/web/app/components/messages/shared/messagePreview/index.tsx`
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add `metadata` to `LastMessage`**

In `chat.ts`, add to the `LastMessage` interface after `agentSlug`:

```typescript
  metadata?: Record<string, unknown> | null;
```

- [ ] **Step 2: Add translation**

In `packages/web/messages/en.json`, in the `"messages"` section, add (in alphabetical position near "L"):

```json
    "Lead score": "Lead score",
```

- [ ] **Step 3: Add lead score badge to MessagePreview**

In `messagePreview/index.tsx`, add a helper function before the component (after the imports):

```typescript
function getLeadScoreBadge(
  metadata: Record<string, unknown> | null | undefined
): { score: number; color: string } | null {
  if (metadata === null || metadata === undefined) return null;
  const score = metadata['lead_score'];
  if (typeof score !== 'number') return null;
  const HOT_THRESHOLD = 70;
  const WARM_THRESHOLD = 40;
  if (score >= HOT_THRESHOLD) return { score, color: 'bg-green-500' };
  if (score >= WARM_THRESHOLD) return { score, color: 'bg-yellow-500' };
  return { score, color: 'bg-gray-400' };
}
```

Then inside the component, add a `useMemo` after the `currentStatus` memo:

```typescript
  const leadScoreBadge = useMemo(
    () => getLeadScoreBadge(lastMessage?.metadata),
    [lastMessage?.metadata]
  );
```

Finally, render the badge. Inside the JSX, after the `{/* Show unread badge ... */}` block and before the closing `</div>` of the message row, add:

```tsx
              {/* Lead score badge */}
              {leadScoreBadge !== null && (
                <Badge
                  className={`h-4 min-w-4 rounded-full px-1 font-mono font-medium tabular-nums text-[10px] ${leadScoreBadge.color}`}
                  title={`${t('Lead score')}: ${String(leadScoreBadge.score)}`}
                >
                  {leadScoreBadge.score}
                </Badge>
              )}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/types/chat.ts packages/web/app/components/messages/shared/messagePreview/index.tsx packages/web/messages/en.json
git commit -m "feat(web): show lead score badge in MessagePreview"
```

---

### Task 13: Web — Simulation Cross-Turn Lead Score Persistence

**Files:**
- Modify: `packages/web/app/hooks/useSimulationHelpers.ts`

- [ ] **Step 1: Capture lead score from tool call events and feed into `data`**

In the `handleNodeProcessedEvent` function, after the `structuredOutput` handling, add logic to capture `set_lead_score` results:

```typescript
  // Capture lead score from set_lead_score tool calls for simulation persistence
  for (const tc of event.toolCalls) {
    if (tc.toolName === 'set_lead_score' && isSetLeadScoreInput(tc.input)) {
      setters.setSimulationLeadScore?.(tc.input.score);
    }
  }
```

Add the type guard helper before `handleNodeProcessedEvent`:

```typescript
function isSetLeadScoreInput(input: unknown): input is { score: number } {
  return typeof input === 'object' && input !== null && 'score' in input && typeof (input as Record<string, unknown>)['score'] === 'number';
}
```

- [ ] **Step 2: Add `setSimulationLeadScore` to `SimulationSetters`**

In the `SimulationSetters` interface, add:

```typescript
  setSimulationLeadScore?: (score: number) => void;
```

- [ ] **Step 3: Inject lead score into `data` in `buildSimulateParams`**

In `buildSimulateParams`, after building `data` from the preset context, merge the lead score from the simulation state. Update the function signature to accept an optional `simulationLeadScore`:

Add `simulationLeadScore?: number | null` to `BuildSimulateParamsOptions`:

```typescript
export interface BuildSimulateParamsOptions extends Pick<
  GraphBuildInputs,
  'agents' | 'mcpServers' | 'outputSchemas'
> {
  snapshot: GraphSnapshot;
  allMessages: Message[];
  currentNode: string;
  preset: ContextPreset;
  apiKeyId: string;
  modelId: string;
  structuredOutputs?: Record<string, unknown[]>;
  orgId?: string;
  simulationLeadScore?: number | null;
}
```

Then in the function body, after `const { sessionID, tenantID, userID, data, quickReplies } = fullContext;`, merge the lead score:

```typescript
  const enrichedData = simulationLeadScore !== undefined && simulationLeadScore !== null
    ? { ...data, lead_score: simulationLeadScore }
    : data;
```

And use `enrichedData` instead of `data` in the return:

```typescript
    data: enrichedData,
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/hooks/useSimulationHelpers.ts
git commit -m "feat(web): persist lead score across simulation turns via data field"
```

---

### Task 14: Wire Simulation Lead Score State in Simulation Panel

**Files:**
- Modify: `packages/web/app/hooks/simulationSendHelpers.ts` (pass `simulationLeadScore` to `buildSimulateParams`)
- Modify: `packages/web/app/components/panels/simulation/SimulationPanel.tsx` (add `simulationLeadScore` state, provide setter, pass to deps)

> **Note:** The exact wiring depends on how `SimulationPanel` manages state. The pattern is:
> 1. Add `const [simulationLeadScore, setSimulationLeadScore] = useState<number | null>(null);` in the simulation panel
> 2. Pass `setSimulationLeadScore` into the `SimulationSetters` object
> 3. Pass `simulationLeadScore` to `buildSimulateParams` via `sendWorkflowSim`
> 4. Reset to `null` when simulation is cleared/reset

- [ ] **Step 1: Add state to SimulationPanel**

In `SimulationPanel.tsx`, add the state:

```typescript
const [simulationLeadScore, setSimulationLeadScore] = useState<number | null>(null);
```

Include `setSimulationLeadScore` in the setters object that is passed to `sendWorkflowSim` / `sendAgentSim`.

Reset it when the simulation is cleared (alongside other state resets).

- [ ] **Step 2: Thread through `simulationSendHelpers.ts`**

In `sendWorkflowSim`, pass `simulationLeadScore` to `buildSimulateParams`:

Find the `buildSimulateParams` call and add:
```typescript
    simulationLeadScore: deps.simulationLeadScore,
```

Add `simulationLeadScore?: number | null` to `SendMessageDeps`:

```typescript
  simulationLeadScore?: number | null;
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/hooks/simulationSendHelpers.ts packages/web/app/components/panels/simulation/SimulationPanel.tsx
git commit -m "feat(web): wire simulation lead score state through simulation panel"
```

---

### Task 15: Run Full Check

- [ ] **Step 1: Run format + lint + typecheck**

```bash
npm run check
```

Expected: All passes (format, lint, typecheck).

- [ ] **Step 2: Fix any issues**

Address any TypeScript or lint errors.

- [ ] **Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: address lint and typecheck issues from lead scoring implementation"
```

---

### Task 16: Final Verification

- [ ] **Step 1: Build all packages**

```bash
npm run build
```

Expected: Clean build.

- [ ] **Step 2: Run API tests**

```bash
npm run test -w packages/api
```

Expected: All existing tests pass.

- [ ] **Step 3: Final commit if needed**

Only if there were additional fixes.
