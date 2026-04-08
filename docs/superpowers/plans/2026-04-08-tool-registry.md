# Unified Tool Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a single source of truth for all tools (MCP, system, future A2A) via a React Context, eliminating prop threading and making partial tool lists structurally unavailable.

**Architecture:** A `ToolRegistryProvider` wraps the editor tree. It receives raw MCP data as props and merges it with system tools in a `useMemo`. Consumers access tools exclusively via `useToolRegistry()`. All convenience APIs for partial lists (`allTools`, `allToolNames`) are removed.

**Tech Stack:** React Context, TypeScript, Next.js App Router

**Spec:** `docs/superpowers/specs/2026-04-08-tool-registry-design.md`

---

### Task 1: Create toolRegistry.ts — types and system tools constant

**Files:**
- Create: `packages/web/app/lib/toolRegistry.ts`

- [ ] **Step 1: Create the file with types, constants, and merge function**

```typescript
import type { DiscoveredTool } from './api';
import type { McpServerConfig } from '../schemas/graph.schema';

export interface RegistryTool {
  name: string;
  description: string | undefined;
  inputSchema: Record<string, unknown> | undefined;
  group: string;
  sourceId: string;
}

export interface ToolGroup {
  groupName: string;
  tools: RegistryTool[];
}

const SYSTEM_SERVER_ID = '__system__';
const SYSTEM_SERVER_NAME = 'OpenFlow/Composition';

const SYSTEM_TOOLS: RegistryTool[] = [
  {
    sourceId: SYSTEM_SERVER_ID,
    group: SYSTEM_SERVER_NAME,
    name: 'create_agent',
    description: 'Create a dynamic sub-agent with a custom system prompt and dispatch it to handle a task.',
    inputSchema: {
      type: 'object',
      properties: {
        systemPrompt: { type: 'string', description: 'The system prompt for the new agent' },
        task: { type: 'string', description: 'The task for the agent to complete' },
        model: { type: 'string', description: 'The LLM model to use (defaults to your own model)' },
        tools: { description: 'Tools to give the agent: "all" for all your tools, or a list of tool names' },
        contextItems: { type: 'array', items: { type: 'string' }, description: 'Context items to inject' },
        maxSteps: { type: 'number', description: 'Maximum number of steps' },
        outputSchema: { type: 'object', description: 'JSON Schema to validate the agent output' },
      },
      required: ['systemPrompt', 'task'],
    },
  },
  {
    sourceId: SYSTEM_SERVER_ID,
    group: SYSTEM_SERVER_NAME,
    name: 'invoke_agent',
    description: 'Invoke an existing agent by slug to handle a task independently.',
    inputSchema: {
      type: 'object',
      properties: {
        agentSlug: { type: 'string', description: 'The slug of the agent to invoke' },
        version: { description: 'Which published version to execute (number or "latest")' },
        task: { type: 'string', description: 'The task for the agent to complete' },
        contextItems: { type: 'array', items: { type: 'string' }, description: 'Additional context items' },
        model: { type: 'string', description: 'Override the agent model' },
        outputSchema: { type: 'object', description: 'JSON Schema to validate the agent output' },
      },
      required: ['agentSlug', 'version', 'task'],
    },
  },
  {
    sourceId: SYSTEM_SERVER_ID,
    group: SYSTEM_SERVER_NAME,
    name: 'invoke_workflow',
    description: 'Invoke an existing workflow by slug with a routing message.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowSlug: { type: 'string', description: 'The slug of the workflow to invoke' },
        version: { description: 'Which published version to execute (number or "latest")' },
        user_said: { type: 'string', description: 'The user message for workflow routing' },
        contextItems: { type: 'array', items: { type: 'string' }, description: 'Additional context items' },
        model: { type: 'string', description: 'Override the workflow model' },
      },
      required: ['workflowSlug', 'version', 'user_said'],
    },
  },
];

function buildMcpTools(servers: McpServerConfig[], discovered: Record<string, DiscoveredTool[]>): RegistryTool[] {
  const tools: RegistryTool[] = [];
  for (const server of servers) {
    for (const tool of discovered[server.id] ?? []) {
      tools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        group: server.name,
        sourceId: server.id,
      });
    }
  }
  return tools;
}

function buildGroups(tools: RegistryTool[]): ToolGroup[] {
  const map = new Map<string, RegistryTool[]>();
  for (const tool of tools) {
    const list = map.get(tool.group) ?? [];
    list.push(tool);
    map.set(tool.group, list);
  }
  const groups: ToolGroup[] = [];
  for (const [groupName, groupTools] of map) {
    groupTools.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ groupName, tools: groupTools });
  }
  // System group always last, rest alphabetical
  const system = groups.filter((g) => g.groupName === SYSTEM_SERVER_NAME);
  const rest = groups.filter((g) => g.groupName !== SYSTEM_SERVER_NAME);
  rest.sort((a, b) => a.groupName.localeCompare(b.groupName));
  return [...rest, ...system];
}

export function buildToolRegistry(
  servers: McpServerConfig[],
  discovered: Record<string, DiscoveredTool[]>
): { tools: RegistryTool[]; groups: ToolGroup[] } {
  const mcpTools = buildMcpTools(servers, discovered);
  const allTools = [...mcpTools, ...SYSTEM_TOOLS];
  return { tools: allTools, groups: buildGroups(allTools) };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/lib/toolRegistry.ts
git commit -m "feat: add toolRegistry.ts with RegistryTool type, system tools, and merge function"
```

---

### Task 2: Create ToolRegistryProvider — context and hook

**Files:**
- Create: `packages/web/app/components/ToolRegistryProvider.tsx`

- [ ] **Step 1: Create the provider file**

```typescript
'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import type { DiscoveredTool } from '../lib/api';
import { type RegistryTool, type ToolGroup, buildToolRegistry } from '../lib/toolRegistry';
import type { McpServerConfig } from '../schemas/graph.schema';

interface ToolRegistryValue {
  tools: RegistryTool[];
  groups: ToolGroup[];
}

const ToolRegistryContext = createContext<ToolRegistryValue | null>(null);

interface ToolRegistryProviderProps {
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
  children: ReactNode;
}

export function ToolRegistryProvider({ servers, discoveredTools, children }: ToolRegistryProviderProps) {
  const value = useMemo(() => buildToolRegistry(servers, discoveredTools), [servers, discoveredTools]);
  return <ToolRegistryContext.Provider value={value}>{children}</ToolRegistryContext.Provider>;
}

export function useToolRegistry(): ToolRegistryValue {
  const ctx = useContext(ToolRegistryContext);
  if (ctx === null) {
    throw new Error('useToolRegistry must be used within a ToolRegistryProvider');
  }
  return ctx;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/ToolRegistryProvider.tsx
git commit -m "feat: add ToolRegistryProvider context and useToolRegistry hook"
```

---

### Task 3: Mount provider in GraphBuilder

**Files:**
- Modify: `packages/web/app/components/GraphBuilder.tsx`

- [ ] **Step 1: Add import**

Add at the top imports:

```typescript
import { ToolRegistryProvider } from './ToolRegistryProvider';
```

- [ ] **Step 2: Wrap the HandleContext.Provider children**

In `LoadedEditor` (around line 418), wrap the content inside `HandleContext.Provider` with `ToolRegistryProvider`:

Replace:
```tsx
    <HandleContext.Provider value={handleContextValue}>
      <div className="relative flex h-full w-full flex-col items-center ml-0">
```

With:
```tsx
    <HandleContext.Provider value={handleContextValue}>
      <ToolRegistryProvider servers={h.mcpHook.servers} discoveredTools={h.mcpHook.discoveredTools}>
      <div className="relative flex h-full w-full flex-col items-center ml-0">
```

And before the closing `</HandleContext.Provider>` (line 592), add the closing tag:

Replace:
```tsx
    </HandleContext.Provider>
```

With:
```tsx
      </ToolRegistryProvider>
    </HandleContext.Provider>
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/GraphBuilder.tsx
git commit -m "feat: mount ToolRegistryProvider in GraphBuilder"
```

---

### Task 4: Migrate all consumers and remove prop threading

This is a single commit because removing props from leaf consumers and their parents must happen together to compile.

**Files:**
- Modify: `packages/web/app/components/panels/ToolCombobox.tsx`
- Modify: `packages/web/app/components/panels/ToolParamsCard.tsx`
- Modify: `packages/web/app/components/panels/ToolsPanel.tsx`
- Modify: `packages/web/app/components/panels/EdgePanel.tsx`
- Modify: `packages/web/app/components/panels/ConnectionMenu.tsx`
- Modify: `packages/web/app/components/panels/nodeCreationDialogs/ToolNodeDialog.tsx`
- Modify: `packages/web/app/components/panels/nodeCreationDialogs/LoopDialog.tsx`
- Modify: `packages/web/app/components/SidePanels.tsx`
- Modify: `packages/web/app/components/GraphBuilder.tsx`

#### Step 1: Migrate ToolCombobox

- [ ] **Step 1a: Rewrite ToolCombobox.tsx**

Replace the entire file content with:

```typescript
'use client';

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from '@/components/ui/combobox';
import { useMemo } from 'react';

import { useToolRegistry } from '../ToolRegistryProvider';

interface ToolGroupItem {
  value: string;
  items: string[];
}

interface ToolComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function ToolCombobox({ value, onValueChange, placeholder }: ToolComboboxProps) {
  const { groups } = useToolRegistry();
  const comboboxGroups = useMemo<ToolGroupItem[]>(
    () => groups.map((g) => ({ value: g.groupName, items: g.tools.map((t) => t.name) })),
    [groups]
  );

  return (
    <Combobox items={comboboxGroups} value={value} onValueChange={(v) => onValueChange(v ?? '')}>
      <ComboboxInput placeholder={placeholder ?? 'Select tool...'} className="h-8 text-xs" />
      <ComboboxContent>
        <ComboboxEmpty>No tools found</ComboboxEmpty>
        <ComboboxList>
          {(group) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(item) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
```

#### Step 2: Migrate ToolParamsCard

- [ ] **Step 2a: Update ToolParamsCard.tsx**

In `packages/web/app/components/panels/ToolParamsCard.tsx`:

1. Replace the import of `DiscoveredTool`:
   - Remove: `import type { DiscoveredTool } from '../../lib/api';`
   - Add: `import type { RegistryTool } from '../../lib/toolRegistry';`
   - Add: `import { useToolRegistry } from '../ToolRegistryProvider';`

2. In `ToolParamsCardProps` (line 29-36), remove the `tools` prop:
   - Remove: `tools: DiscoveredTool[];`

3. Update `findTool` (line 44-46):
   - Change: `function findTool(name: string, tools: DiscoveredTool[]): DiscoveredTool | undefined {`
   - To: `function findTool(name: string, tools: RegistryTool[]): RegistryTool | undefined {`

4. In the `ToolParamsCard` component (line 198-252):
   - Remove `tools` from the destructured props
   - Add `const { tools } = useToolRegistry();` as the first line inside the component

#### Step 3: Migrate ToolsPanel

- [ ] **Step 3a: Update ToolsPanel.tsx**

In `packages/web/app/components/panels/ToolsPanel.tsx`:

1. Replace imports:
   - Remove: `import type { DiscoveredTool, ToolCallOptions } from '../../lib/api';`
   - Add: `import type { ToolCallOptions } from '../../lib/api';`
   - Add: `import type { RegistryTool, ToolGroup } from '../../lib/toolRegistry';`
   - Add: `import { useToolRegistry } from '../ToolRegistryProvider';`

2. Remove from `ToolsPanelProps` (lines 34-40):
   - Remove: `servers: McpServerConfig[];`
   - Remove: `discoveredTools: Record<string, DiscoveredTool[]>;`

3. Delete the following (lines 42-136):
   - `FlatTool` interface
   - `ToolGroup` interface (the local one — now imported from `toolRegistry.ts`)
   - `SYSTEM_SERVER_ID` constant
   - `SYSTEM_SERVER_NAME` constant
   - `SYSTEM_TOOLS` array
   - `buildToolGroups()` function

4. Update all `FlatTool` references to `RegistryTool`:
   - `PlayButton` props: `tool: FlatTool` → `tool: RegistryTool`, `onTest: (tool: FlatTool) => void` → `onTest: (tool: RegistryTool) => void`
   - `ToolRow` props: same pattern
   - `ToolsList` props: `onTestTool: (tool: FlatTool) => void` → `onTestTool: (tool: RegistryTool) => void`

5. Update `ToolGroup` field references — the imported `ToolGroup` uses `groupName` not `serverName`:
   - In `filterGroups`: `g.tools` stays the same, but `groups.map((g) => ({ ...g, tools: ... }))` works because we spread.  Actually, `filterGroups` maps over `ToolGroup` which now has `groupName` instead of `serverName`. Update:
     - In `ToolsList`, `group.serverName` → `group.groupName`
   - In the `ToolRow` component, `tool.serverName` → `tool.group` (the `RegistryTool` field is `group` not `serverName`)
   - In the `ToolsList` key: `key={group.serverName}` → `key={group.groupName}`
   - In the tool key: `` `${tool.serverName}-${tool.name}` `` → `` `${tool.group}-${tool.name}` ``

6. Update `useToolTest` (line 333-341):
   - `useState<FlatTool | null>` → `useState<RegistryTool | null>`
   - `openTest = useCallback((tool: FlatTool) => ...)` → `openTest = useCallback((tool: RegistryTool) => ...)`
   - `servers.find((s) => s.id === testingTool.serverId)` → `servers.find((s) => s.id === testingTool.sourceId)`

7. Update `ToolsPanel` component:
   - Remove `servers`, `discoveredTools` from destructured props
   - Add `const { groups: allGroups } = useToolRegistry();` at top of component
   - Change: `const allGroups = useMemo(() => buildToolGroups(servers, discoveredTools), [servers, discoveredTools]);` → delete this line (replaced by the context call above)
   - `useToolTest(servers, mcp.orgId)` → `useToolTest(mcp.servers, mcp.orgId)` (servers now come from the `mcp` prop which already has them)

#### Step 4: Update EdgePanel

- [ ] **Step 4a: Update EdgePanel.tsx**

In `packages/web/app/components/panels/EdgePanel.tsx`:

1. Remove from `EdgePanelProps` (lines 70-72):
   - `availableMcpTools?: DiscoveredTool[];`
   - `mcpServers?: McpServerConfig[];`
   - `mcpDiscoveredTools?: Record<string, DiscoveredTool[]>;`

2. Remove from destructured params (lines 86-88):
   - `availableMcpTools = [],`
   - `mcpServers = [],`
   - `mcpDiscoveredTools = {},`

3. Update `ToolParamsCard` usages (lines 576-579, 650-653):
   - Remove `tools={availableMcpTools}` prop
   - Change guard `p.type === "tool_call" && availableMcpTools.length > 0` → `p.type === "tool_call"`

4. Update `ToolCombobox` usages (lines 632-633, 798-799, 890-891):
   - Remove `servers={mcpServers}` prop
   - Remove `discoveredTools={mcpDiscoveredTools}` prop

5. Remove unused imports if `DiscoveredTool` and `McpServerConfig` are no longer used here (check if other parts of EdgePanel still reference them).

#### Step 5: Update ConnectionMenu

- [ ] **Step 5a: Update ConnectionMenu.tsx**

In `packages/web/app/components/panels/ConnectionMenu.tsx`:

1. Remove from `ConnectionMenuProps` (lines 46-47):
   - `mcpServers: McpServerConfig[];`
   - `mcpDiscoveredTools: Record<string, DiscoveredTool[]>;`

2. Remove from `DialogsProps` (lines 63-64):
   - `mcpServers: McpServerConfig[];`
   - `mcpDiscoveredTools: Record<string, DiscoveredTool[]>;`

3. Remove from `ConnectionDialogs` destructured params (lines 76-77):
   - `mcpServers,`
   - `mcpDiscoveredTools,`

4. Remove from `ToolNodeDialog` call (lines 96-97):
   - `servers={mcpServers}`
   - `discoveredTools={mcpDiscoveredTools}`

5. Remove from `LoopDialog` call (lines 111-112):
   - `servers={mcpServers}`
   - `discoveredTools={mcpDiscoveredTools}`

6. Remove from `ConnectionMenu` destructured params (lines 130-131):
   - `mcpServers,`
   - `mcpDiscoveredTools,`

7. Remove from `ConnectionDialogs` call (lines 222-223):
   - `mcpServers={mcpServers}`
   - `mcpDiscoveredTools={mcpDiscoveredTools}`

8. Remove unused imports (`DiscoveredTool`, `McpServerConfig`) if no longer referenced.

#### Step 6: Update ToolNodeDialog

- [ ] **Step 6a: Update ToolNodeDialog.tsx**

In `packages/web/app/components/panels/nodeCreationDialogs/ToolNodeDialog.tsx`:

1. Remove imports (lines 15-16):
   - `import type { DiscoveredTool } from '../../../lib/api';`
   - `import type { McpServerConfig } from '../../../schemas/graph.schema';`

2. Remove from `ToolNodeDialogProps` (lines 25-26):
   - `servers: McpServerConfig[];`
   - `discoveredTools: Record<string, DiscoveredTool[]>;`

3. Remove from destructured params (lines 34-35):
   - `servers,`
   - `discoveredTools,`

4. Remove from `ToolCombobox` call (lines 63-64):
   - `servers={servers}`
   - `discoveredTools={discoveredTools}`

#### Step 7: Update LoopDialog

- [ ] **Step 7a: Update LoopDialog.tsx**

In `packages/web/app/components/panels/nodeCreationDialogs/LoopDialog.tsx`:

1. Remove imports (lines 10-11):
   - `import type { DiscoveredTool } from '../../../lib/api';`
   - `import type { McpServerConfig } from '../../../schemas/graph.schema';`

2. Remove from `LoopDialogProps` (lines 28-29):
   - `servers: McpServerConfig[];`
   - `discoveredTools: Record<string, DiscoveredTool[]>;`

3. Remove from `LoopDialog` destructured params (lines 78-79):
   - `servers,`
   - `discoveredTools,`

4. Remove from `ConnectionValueField` call (lines 154-155):
   - `servers={servers}`
   - `discoveredTools={discoveredTools}`

5. Update `ConnectionValueField` function signature (lines 192-204):
   - Remove `servers` and `discoveredTools` params
   - Remove their types (`McpServerConfig[]`, `Record<string, DiscoveredTool[]>`)

6. Remove from `ToolCombobox` call inside `ConnectionValueField` (lines 214-215):
   - `servers={servers}`
   - `discoveredTools={discoveredTools}`

#### Step 8: Update SidePanels

- [ ] **Step 8a: Update SidePanels.tsx**

In `packages/web/app/components/SidePanels.tsx`:

1. In the `EdgePanel` call (lines 128-137), remove:
   - `availableMcpTools={props.mcpHook.allTools}` (line 132)
   - `mcpServers={props.mcpHook.servers}` (line 133)
   - `mcpDiscoveredTools={props.mcpHook.discoveredTools}` (line 134)

2. In the `ToolsPanelSlot` → `ToolsPanel` call (lines 170-189), remove:
   - `servers={p.mcpHook.servers}` (line 171)
   - `discoveredTools={p.mcpHook.discoveredTools}` (line 172)

#### Step 9: Update GraphBuilder (second pass)

- [ ] **Step 9a: Update GraphBuilder.tsx**

In `packages/web/app/components/GraphBuilder.tsx`, remove from the `ConnectionMenu` call (lines 587-588):
- `mcpServers={h.mcpHook.servers}`
- `mcpDiscoveredTools={h.mcpHook.discoveredTools}`

#### Step 10: Verify and commit

- [ ] **Step 10a: Run full check**

Run: `npm run check`
Expected: format, lint, and typecheck all pass

- [ ] **Step 10b: Commit all consumer migrations**

```bash
git add packages/web/app/components/panels/ToolCombobox.tsx \
       packages/web/app/components/panels/ToolParamsCard.tsx \
       packages/web/app/components/panels/ToolsPanel.tsx \
       packages/web/app/components/panels/EdgePanel.tsx \
       packages/web/app/components/panels/ConnectionMenu.tsx \
       packages/web/app/components/panels/nodeCreationDialogs/ToolNodeDialog.tsx \
       packages/web/app/components/panels/nodeCreationDialogs/LoopDialog.tsx \
       packages/web/app/components/SidePanels.tsx \
       packages/web/app/components/GraphBuilder.tsx
git commit -m "refactor: migrate all tool consumers to ToolRegistryProvider, remove prop threading"
```

---

### Task 5: Clean useMcpServers — remove partial-list APIs

**Files:**
- Modify: `packages/web/app/hooks/useMcpServers.ts`

- [ ] **Step 1: Remove collectToolNames and collectAllTools functions**

In `packages/web/app/hooks/useMcpServers.ts`, delete:

```typescript
function collectToolNames(discoveredTools: Record<string, DiscoveredTool[]>): string[] {
  const names = new Set<string>();
  for (const tools of Object.values(discoveredTools)) {
    for (const tool of tools) {
      names.add(tool.name);
    }
  }
  return [...names];
}

function collectAllTools(discoveredTools: Record<string, DiscoveredTool[]>): DiscoveredTool[] {
  const seen = new Set<string>();
  const allTools = Object.values(discoveredTools).flat();
  return allTools.filter((tool) => {
    if (seen.has(tool.name)) return false;
    seen.add(tool.name);
    return true;
  });
}
```

- [ ] **Step 2: Remove from McpServersState interface**

In `McpServersState` (lines 22-35), remove:
- `allToolNames: string[];` (line 25)
- `allTools: DiscoveredTool[];` (line 26)

- [ ] **Step 3: Remove from hook return**

In `useMcpServers` function (lines 288-321):

Remove these lines:
```typescript
  const allToolNames = collectToolNames(discoveredTools);
  const allTools = collectAllTools(discoveredTools);
```

And remove from the return object:
```typescript
    allToolNames,
    allTools,
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run check`
Expected: PASS — no consumer references `allTools` or `allToolNames` anymore after Task 4.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/hooks/useMcpServers.ts
git commit -m "refactor: remove allTools/allToolNames from useMcpServers — registry is the only tool access"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full check**

Run: `npm run check`
Expected: format + lint + typecheck all pass across all packages.

- [ ] **Step 2: Verify no partial-list references remain**

Run: `grep -r "allTools\|allToolNames\|availableMcpTools\|FlatTool" packages/web/app/ --include="*.ts" --include="*.tsx" -l`
Expected: No files. If any remain, they are bugs to fix.

- [ ] **Step 3: Verify system tools appear everywhere**

Manual check: open the app, go to the workflow builder:
1. Open the Tools panel — system tools should appear under "OpenFlow/Composition"
2. Click an edge, set precondition type to "tool_call" — combobox should show system tools
3. Select `invoke_agent` — `ToolParamsCard` should show its input schema (agentSlug, version, task)
4. Click "Create new node" → "Tool" — combobox should show system tools
