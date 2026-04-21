# Unified Tool Registry

## Problem

Tools come from multiple sources (MCP servers, system/built-in, A2A in the future) but are consumed by 5+ UI components. Each source manages its own state, and each consumer manually stitches sources together. This creates two classes of bugs:

1. **Consumer sees partial list.** `ToolParamsCard` receives only `availableMcpTools`, so system tools show no args when selected.
2. **Source registered in wrong place.** System tools are duplicated in `ToolsPanel.tsx` (full schemas) and `ToolCombobox.tsx` (bare names) independently.

Adding 3 system tools required touching 4+ files. Adding A2A tools would require touching them all again.

## Goal

Make it **structurally impossible** for any consumer to see a partial tool list, and **structurally impossible** for a developer to register a tool in the wrong place.

## Design

### Core Type

One type for all tools regardless of source. Lives in `app/lib/toolRegistry.ts`:

```typescript
export interface RegistryTool {
  name: string;
  description: string | undefined;
  inputSchema: Record<string, unknown> | undefined;
  group: string;     // display grouping: server name, "OpenFlow/Composition", etc.
  sourceId: string;  // stable key: server id, '__system__', a2a peer id
}

export interface ToolGroup {
  groupName: string;
  tools: RegistryTool[];
}
```

`RegistryTool` is a structural superset of `DiscoveredTool` (has `name`, `description?`, `inputSchema?`). Existing code that expects `DiscoveredTool` works without type changes.

### System Tools Constant

The same file exports `SYSTEM_TOOLS: RegistryTool[]` — the 3 built-in tools (`create_agent`, `invoke_agent`, `invoke_workflow`) with their full JSON Schema definitions. This is the single canonical definition. No other file defines system tools.

Also exports `SYSTEM_SERVER_ID = '__system__'` and `SYSTEM_SERVER_NAME = 'OpenFlow/Composition'` constants.

### Registry Provider

New file: `app/components/ToolRegistryProvider.tsx`.

A React Context with a `useMemo` merge:

```typescript
interface ToolRegistryValue {
  tools: RegistryTool[];   // flat merged list
  groups: ToolGroup[];     // pre-computed for display
}
```

The provider receives `servers: McpServerConfig[]` and `discoveredTools: Record<string, DiscoveredTool[]>` as props. Inside, a pure `buildToolRegistry(servers, discoveredTools)` function:

1. Maps each MCP server's discovered tools to `RegistryTool[]` (adding `group: server.name`, `sourceId: server.id`).
2. Appends `SYSTEM_TOOLS`.
3. Builds sorted `ToolGroup[]` (MCP groups alphabetically, then system group last).

Adding a future source (A2A): add one parameter to the provider props and one array spread to the merge. Zero consumer changes.

### Consumer Hook

```typescript
export function useToolRegistry(): ToolRegistryValue
```

Throws if used outside the provider. This is the only way to access tools.

### Provider Mount Point

The provider mounts in `GraphBuilder.tsx`, wrapping `LoadedEditor` content:

```tsx
<ToolRegistryProvider
  servers={h.mcpHook.servers}
  discoveredTools={h.mcpHook.discoveredTools}
>
  {/* all existing JSX */}
</ToolRegistryProvider>
```

Every component that needs tools is inside this provider.

### Eliminating Partial Access

`useMcpServers` currently exposes `allTools: DiscoveredTool[]` and `allToolNames: string[]`. Both are deleted. The raw `discoveredTools: Record<string, DiscoveredTool[]>` stays because MCP lifecycle needs it (the provider reads it), but it never flows directly to tool consumers.

Functions removed from `useMcpServers`: `collectToolNames()`, `collectAllTools()`.

Fields removed from `McpServersState`: `allTools`, `allToolNames`.

After this change, there is no API that returns a partial tool list. The only way to get tools is `useToolRegistry()`.

## Consumer Changes

### ToolsPanel

**Before:** Props `servers`, `discoveredTools`. Local `FlatTool` type, `SYSTEM_TOOLS` array, `buildToolGroups()` function.

**After:** `const { groups } = useToolRegistry()`. Local types, constants, and group-building logic deleted. The `filterGroups()` and `countTools()` display helpers stay (they operate on the pre-built groups).

Props removed: `servers`, `discoveredTools`.

### ToolCombobox

**Before:** Props `servers`, `discoveredTools`. Local `SYSTEM_GROUP_NAME`, `SYSTEM_TOOL_NAMES`, `buildGroups()`.

**After:** `const { groups } = useToolRegistry()`. Converts `ToolGroup[]` to `ToolGroupItem[]` (string-based) via a `useMemo` map. Local constants and group-building deleted.

Props removed: `servers`, `discoveredTools`.

### ToolParamsCard

**Before:** Prop `tools: DiscoveredTool[]`. Uses `tools.find(t => t.name === name)`.

**After:** `const { tools } = useToolRegistry()`. Same `find()` call. Type annotation updated from `DiscoveredTool` to `RegistryTool`.

Props removed: `tools`.

### EdgePanel

**Before:** Props `availableMcpTools`, `mcpServers`, `mcpDiscoveredTools`. Threads to `ToolCombobox` and `ToolParamsCard`.

**After:** No tool-related props. Children use context directly.

Props removed: `availableMcpTools`, `mcpServers`, `mcpDiscoveredTools`.

### ConnectionMenu

**Before:** Props `mcpServers`, `mcpDiscoveredTools`. Threads to `ToolNodeDialog`, `LoopDialog`.

**After:** No tool-related props. Children use context directly.

Props removed: `mcpServers`, `mcpDiscoveredTools`.

### ToolNodeDialog

**Before:** Props `servers`, `discoveredTools`. Threads to `ToolCombobox`.

**After:** No tool-related props. `ToolCombobox` uses context directly.

Props removed: `servers`, `discoveredTools`.

### LoopDialog

**Before:** Props `servers`, `discoveredTools`. Threads through `ConnectionValueField` to `ToolCombobox`.

**After:** No tool-related props. `ConnectionValueField` and `ToolCombobox` use context directly.

Props removed: `servers`, `discoveredTools`.

### SidePanels

**Before:** Passes `mcpHook.allTools`, `mcpHook.servers`, `mcpHook.discoveredTools` to `EdgePanel`. Passes `mcpHook.servers`, `mcpHook.discoveredTools` to `ToolsPanel`.

**After:** Does not pass tool-related props to `EdgePanel` or `ToolsPanel`.

### ToolTestModal

**No changes.** Receives a single tool object + transport from `ToolsPanel`'s `useToolTest`. Does not need the registry.

### useMcpServers

**Stays as MCP lifecycle manager.** Continues to own server add/remove, discovery state, connection status, `discoveredTools` state. No longer computes or exposes `allTools`/`allToolNames`.

## Prop Threading Paths Eliminated

| Path | Props removed |
|------|---------------|
| `GraphBuilder` → `SidePanels` → `EdgePanel` → `ToolCombobox`/`ToolParamsCard` | `availableMcpTools`, `mcpServers`, `mcpDiscoveredTools` |
| `GraphBuilder` → `ConnectionMenu` → `ToolNodeDialog` → `ToolCombobox` | `mcpServers`, `mcpDiscoveredTools` |
| `GraphBuilder` → `ConnectionMenu` → `LoopDialog` → `ConnectionValueField` → `ToolCombobox` | `mcpServers`, `mcpDiscoveredTools` |
| `SidePanels` → `ToolsPanelSlot` → `ToolsPanel` | `servers`, `discoveredTools` |

## What Stays Unchanged

- `useMcpServers` keeps managing MCP lifecycle (add/remove servers, discovery triggers, connection status).
- The `mcp` prop on `ToolsPanel` stays — it carries MCP management UI data, not tool data.
- `ToolTestModal` still receives a single tool + transport from `ToolsPanel`'s `useToolTest`. Works because `ToolTestModal` uses a structural type `{ name; description?; inputSchema? }`, not `FlatTool` directly. `useToolTest` state type changes from `FlatTool | null` to `RegistryTool | null`.
- `ToolParamsCard`'s `findTool()` logic and `PropertyRow` rendering stay the same.
- `ToolsPanel`'s `filterGroups()`, `countTools()`, search, and tab UI stay the same.
- `StatusButton.tsx` uses `discoveredTools` for per-server MCP health checks — this is legitimate MCP lifecycle data, not tool listing. Out of scope.
- `useMcpDiscovery.ts` bootstraps initial `discoveredTools` — data source, not consumer. Out of scope.

## Guarantees

1. **No convenient partial-list API exists.** `allTools`/`allToolNames` are deleted. The only tool-access API is `useToolRegistry()`, which always returns the merged result. Note: `discoveredTools` remains on `McpServersState` for MCP lifecycle (server health checks, discovery state). A developer could theoretically reconstruct a partial list from it, but there is no helper that does so — they would have to actively work against the pattern.
2. **One canonical place for each tool source.** System tools are defined once in `toolRegistry.ts`. MCP tools flow through `discoveredTools` state. Both merge in one `useMemo` inside the provider. There is no other registration mechanism.
3. **Adding a new source requires one change.** Add a prop to the provider and one array spread in the merge function. Zero consumer changes.

## Files

### New

| File | Purpose |
|------|---------|
| `app/lib/toolRegistry.ts` | `RegistryTool`, `ToolGroup` types; `SYSTEM_TOOLS` constant; `buildToolRegistry()` merge function |
| `app/components/ToolRegistryProvider.tsx` | Context, Provider, `useToolRegistry()` hook |

### Modified

| File | Changes |
|------|---------|
| `app/hooks/useMcpServers.ts` | Remove `allTools`, `allToolNames`, `collectToolNames`, `collectAllTools` |
| `app/components/GraphBuilder.tsx` | Mount `ToolRegistryProvider`; remove `mcpServers`/`mcpDiscoveredTools` from `ConnectionMenu` |
| `app/components/SidePanels.tsx` | Remove tool props from `EdgePanel` and `ToolsPanel` call sites |
| `app/components/panels/ToolsPanel.tsx` | Remove `FlatTool`, `SYSTEM_TOOLS`, `buildToolGroups`; use `useToolRegistry()`; `useToolTest` state type `FlatTool` → `RegistryTool` |
| `app/components/panels/ToolCombobox.tsx` | Remove `SYSTEM_GROUP_NAME`, `SYSTEM_TOOL_NAMES`, `buildGroups`; use `useToolRegistry()` |
| `app/components/panels/ToolParamsCard.tsx` | Remove `tools` prop; use `useToolRegistry()` |
| `app/components/panels/EdgePanel.tsx` | Remove `availableMcpTools`, `mcpServers`, `mcpDiscoveredTools` props; update `availableMcpTools.length > 0` guard to use registry |
| `app/components/panels/ConnectionMenu.tsx` | Remove `mcpServers`, `mcpDiscoveredTools` props |
| `app/components/panels/nodeCreationDialogs/ToolNodeDialog.tsx` | Remove `servers`, `discoveredTools` props |
| `app/components/panels/nodeCreationDialogs/LoopDialog.tsx` | Remove `servers`, `discoveredTools` props |

## Implementation Order

| Phase | Files | What |
|-------|-------|------|
| 1 — Foundation | `toolRegistry.ts`, `ToolRegistryProvider.tsx` | New files, nothing breaks |
| 2 — Wire | `GraphBuilder.tsx` | Mount provider |
| 3-5 — Migrate consumers | All consumer + intermediary + top-level files | Switch to context and remove all threaded props (single commit — removing props from leaf consumers while parents still pass them won't compile) |
| 6 — Clean source | `useMcpServers` | Remove `allTools`/`allToolNames` |
