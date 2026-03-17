# MCP Tool Testing — Design Spec

**Goal:** Let users test individual MCP tools from the Tools tab — provide inputs, run the tool against the real MCP server, and see the result — without running a full simulation.

**Architecture:** Split-pane modal (input left, result right) triggered from a play button on each tool row. The frontend proxies the call through the Next.js backend to the Express backend, which connects to the specific MCP server, executes the tool, and returns the result.

---

## Modal Layout

The modal is `max-w-5xl` (~960px), vertically centered, with `h-[min(70vh,640px)]` fixed height and independent scroll on each half.

Split ratio: `grid grid-cols-[45fr_55fr]` — the result pane gets more room because JSON payloads need width.

### Header (full width, border-b separator)

- Tool name: `font-mono text-sm font-semibold tracking-tight`, `truncate` with `max-w-[70%]` and full-name tooltip on hover
- Description: `text-xs text-muted-foreground line-clamp-1`, full text in tooltip on hover
- Close button top-right

### Left Half — Input

Content area: `px-5 py-4 overflow-y-auto scroll-py-4`

- Required fields first, each with:
  - Label: `Label` component (`text-xs font-medium`) + `text-destructive` `*` indicator
  - Helper text from schema `description`: `text-[10px] text-muted-foreground leading-tight mt-0.5 mb-1`
  - Appropriate input widget (see Field Mapping below)
  - Field spacing: `gap-4`
- Optional fields in a collapsible "Optional" section:
  - Header: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` with `ChevronRight` → `ChevronDown` rotation (`transition-transform duration-200`)
  - Collapsed by default, unless the tool has ONLY optional inputs (then expanded)
  - Content animates: `animate-in fade-in-0 slide-in-from-top-1 duration-200`
- **Sticky Run button footer:** `sticky bottom-0 bg-background pt-2 pb-1 border-t` — always visible even with long forms

### Right Half — Result

Content area: `px-5 py-4 overflow-y-auto scroll-py-4`

Five visual states:

1. **Empty** — Centered `Terminal` icon (`size-8 text-muted-foreground/40`) + muted text, wrapped in `border border-dashed rounded-lg m-4 flex-1` frame
2. **Loading** — Centered `Loader2` spinner (`size-5 animate-spin text-muted-foreground`) + pulsing "Running..." text. **Only shown after 300ms delay** — fast responses skip straight to result (suppress flash of spinner via `setTimeout`/`clearTimeout`). For calls exceeding 5s, show elapsed time counter (`text-[10px] text-muted-foreground tabular-nums`)
3. **Success** — `Badge` with `bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-transparent` at top. JSON result rendered via existing `MarkdownHooks` component (with `rehype-starry-night` + `remark-gfm`) inside a fenced code block. Copy button (`variant="ghost" size="icon-xs"`) at top-right of JSON block — `Copy` → `Check` icon swap for 2s. For responses >50 lines, initially show first 20 lines with gradient fade + "Show all (N lines)" toggle.
4. **Error** — `Badge variant="destructive"` at top. Error message in `text-sm font-medium text-foreground` (not red — the badge establishes context). Error code in `font-mono text-xs`. Details JSON rendered via `MarkdownHooks` in `bg-muted/50 rounded-lg`.
5. **No Input** — Tool has no `inputSchema` or no properties. Left pane shows "This tool requires no input." Run button enabled immediately.

**Result appearance animations:** Status pill `animate-in slide-in-from-top-1 fade-in-0 duration-200`, content `animate-in fade-in-0 duration-300 delay-100` (100ms stagger for cascading feel).

### Vertical Separator

Use `Separator` component with `orientation="vertical"` between panes (not `border-r`).

---

## Field Mapping (JSON Schema → Input Widget)

| Schema type | Widget | Notes |
|---|---|---|
| `string` | Input | `description` as placeholder |
| `string` + `enum` | Select (shadcn) | Options from enum array |
| `number` / `integer` | Input `type="number"` | |
| `boolean` | Checkbox (shadcn) | |
| `array` | Textarea | `font-mono text-[11px] bg-muted/30 min-h-24`, JSON validated on blur, inline `text-[10px] text-destructive` error |
| `object` | Textarea | Same as array |

Required fields are determined from the schema's top-level `required` array and per-property `required: true`.

---

## Data Flow

```
User clicks "Run"
  → callMcpTool(transport, toolName, args, { variableValues, orgId, libraryItemId })
  → POST /api/mcp/tools/call  (Next.js route)
     - Authenticate via Supabase
     - Resolve variable values (env refs → actual values)
     - Resolve OAuth tokens if applicable
     → POST http://backend:4000/mcp/tools/call  (Express route)
        - Validate request
        - connectMcpClient(transport)
        - client.callTool({ name: toolName, arguments: args })
        - Return result or structured error
     ← { success: true, result } or { success: false, error: { message, code?, details? } }
  ← Frontend displays result or error in right half
```

Each tool knows its parent MCP server (the `FlatTool` carries `serverName`, and the tools panel maps server ID → `McpServerConfig`). The modal receives the specific server config so it sends the correct transport.

---

## Response Shape

```typescript
// Backend → Frontend
// Success:
{ success: true, result: unknown }

// Error:
{ success: false, error: { message: string, code?: string, details?: unknown } }
```

The backend catches all exceptions and maps them to this shape. Connection failures, tool execution errors, timeouts — all get descriptive messages plus any metadata the MCP server provided. No stack traces.

---

## Component Architecture

### New files

| File | Purpose |
|---|---|
| `ToolTestModal.tsx` | Split-pane modal. Receives tool + server config. Manages form state, execution, result display. |
| `ToolTestForm.tsx` | Left half. Builds form fields from `inputSchema`. Manages values, required validation. Exposes `onRun(args)` + `canRun` boolean. |
| `ToolTestResult.tsx` | Right half. Pure display. Receives `state` + `result` or `error`. Renders the four visual states. Uses existing `MarkdownHooks` + `rehype-starry-night` for JSON syntax highlighting. |
| `POST /api/mcp/tools/call` (Next.js route) | Auth + variable resolution + proxy to backend. Same pattern as `/api/mcp/discover`. |
| `POST /mcp/tools/call` (Express route) | Connects to MCP server, calls tool, returns result or structured error. |

### Modified files

| File | Change |
|---|---|
| `ToolsPanel.tsx` | Add play button (lucide `Play` icon) to each `ToolRow`, visible on hover only (`opacity-0 group-hover/tool:opacity-100 transition-opacity`). `e.stopPropagation()` to avoid triggering row expand. Tooltip: "Test tool". On click, opens `ToolTestModal`. |
| `api.ts` (frontend) | Add `callMcpTool()` function. |
| `types.ts` (backend) | Add `ToolCallRequest` and `ToolCallResponse` types. |
| `en.json` | Translations for all new UI text. |

### No new dependencies

- shadcn Dialog for the modal
- Existing `MarkdownHooks` + `rehype-starry-night` for JSON highlighting (already used in `NodePromptDialog.tsx`)
- Existing Input/Select/Checkbox/Label/Badge/Separator/Tooltip for form and result display
- Tailwind for styling

---

## Run Button

**Position:** Sticky bottom of left pane: `sticky bottom-0 bg-background pt-2 pb-1 border-t`.

**Size:** `Button` with `size="lg"` (`h-8`), `w-full` — sole CTA in left pane, deserves visual weight.

**States:**
- **Enabled:** `variant="default"` (primary)
- **Disabled:** Built-in `disabled:opacity-50`. Below button: `text-[10px] text-muted-foreground text-center mt-1.5` hint: "Fill in all required fields to run."
- **Loading:** Text swaps to "Running..." with `Loader2 animate-spin size-3` prepended. Button stays visually enabled but functionally disabled.

**Cancel:** During execution, a `variant="ghost" text-muted-foreground` cancel button appears next to Run. Backed by `AbortController`.

---

## Play Button (trigger on tool row)

```tsx
<Button
  variant="ghost"
  size="icon-xs"
  className="opacity-0 group-hover/tool:opacity-100 transition-opacity shrink-0"
  onClick={(e) => { e.stopPropagation(); onTest(tool); }}
>
  <Play className="size-3" />
</Button>
```

- Add `group/tool` to the `ToolRow` wrapper
- Wrap in `Tooltip` with `side="left"`, text: "Test tool"

---

## Typography Scale

| Element | Classes |
|---|---|
| Tool name (header) | `font-mono text-sm font-semibold tracking-tight` |
| Description (header) | `text-xs text-muted-foreground line-clamp-1` |
| Section labels | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` |
| Form labels | `text-xs font-medium` (via `Label`) |
| Helper text | `text-[10px] text-muted-foreground leading-tight` |
| JSON content | Rendered via `MarkdownHooks` in fenced code block |
| Badges/pills | Via `Badge` component |

---

## UI Text (translations)

```
toolTest.emptyState        = "Run a tool to see the result here."
toolTest.run               = "Run"
toolTest.running           = "Running..."
toolTest.success           = "Success"
toolTest.error             = "Error"
toolTest.optional          = "Optional"
toolTest.errorMessage      = "Message"
toolTest.errorCode         = "Code"
toolTest.errorDetails      = "Details"
toolTest.requiredFields    = "Fill in all required fields to run."
toolTest.jsonPlaceholder   = "Enter JSON..."
toolTest.invalidJson       = "Invalid JSON"
toolTest.noInput           = "This tool requires no input."
toolTest.testTool          = "Test tool"
toolTest.cancel            = "Cancel"
toolTest.showAll           = "Show all ({count} lines)"
toolTest.collapse          = "Collapse"
toolTest.copied            = "Copied"
```

---

## Error Display (right half, error state)

```
┌────────────────────────────────────┐
│  [Error]  (destructive badge)      │
│                                    │
│  Connection refused                │
│  (text-sm font-medium, NOT red)    │
│                                    │
│  Code  ECONNREFUSED               │
│  (muted label, mono value)         │
│                                    │
│  DETAILS                           │
│  ┌──────────────────────────────┐  │
│  │ ```json                      │  │
│  │ {                            │  │
│  │   "address": "127.0.0.1",   │  │
│  │   "port": 3456              │  │
│  │ }                            │  │
│  │ ```                          │  │
│  └──────────────────────────────┘  │
└────────────────────────────────────┘
```

Error text uses `text-foreground` (not red) — the destructive badge establishes the error context; coloring body text red reduces legibility.

---

## Edge Cases

- **Very long tool names:** `truncate` + `max-w-[70%]` + full-name tooltip
- **Many required fields:** Sticky Run button ensures CTA is always visible
- **Huge JSON responses:** Show first 20 lines + gradient fade + "Show all (N lines)" toggle. Truncate at 500 lines for truly massive payloads with note.
- **Tools with no inputs:** "This tool requires no input." + Run enabled immediately
- **Tools with only optional inputs:** Optional section starts expanded, Run enabled immediately
- **Network timeout during execution:** Cancel button with `AbortController`. Error state shows timeout details.
