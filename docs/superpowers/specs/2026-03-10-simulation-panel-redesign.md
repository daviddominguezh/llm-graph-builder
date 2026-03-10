# Simulation Panel Redesign — "Flight Recorder"

## Context

The simulation panel is the primary debug interface for AI agent workflows. Users need to see node execution paths, token consumption per node, tool calls, and agent responses in real time via SSE streaming. The panel is constrained to 350px max width on the left side of the canvas.

## Design Philosophy

Minimalist, information-dense, military-grade precision. Every pixel earns its place. Inspired by flight data recorders and Bloomberg terminals.

## Design

### Panel Container
- Width: `w-[350px]`, full height, left-aligned, flush to edge
- `bg-background` with `border-r` — no floating card shadow
- No outer margin/padding waste

### Header (~48px)
- Row 1: "Simulation" label + icon-only stop button (square, destructive, `size-7`), flush right
- Row 2: Breadcrumb trail in `font-mono text-[10px]`, arrows as `→`, last node bold, truncates with ellipsis

### Node Result Items
Left-border accent groups (`border-l-2 border-muted-foreground/30`):
- **Header line**: Node ID (`font-mono text-[11px] font-medium`) + tokens flush-right (`font-mono text-[10px]`, format: `↓701 ↑58`, show cached only if non-zero)
- **Tool calls**: Collapsed by default. Single line: wrench icon + tool name + chevron. Expand reveals JSON `pre` block (`max-h-28 overflow-auto bg-muted text-[10px] font-mono`)
- **Agent text**: Plain `text-xs`, no bubble, no background

### Spacing
- `gap-3` between node groups, `gap-0.5` within
- `pl-3` content indent inside left-border
- `py-1` on node group

### User Messages
- Right-aligned pill: `bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs max-w-[85%]`

### Cleanup
- Remove redundant ZoomViewOverlay "Stop simulation" button during active simulation
- Remove all temporary `console.log` debug lines from SSE pipeline

## Files to Modify

1. `packages/web/app/components/panels/simulation/SimulationPanel.tsx` — container, header, breadcrumbs
2. `packages/web/app/components/panels/simulation/NodeResultItem.tsx` — left-border groups, collapsible tool calls, compact tokens
3. `packages/web/app/components/panels/simulation/TokenDisplay.tsx` — compact `↓↑` format
4. `packages/web/app/components/GraphCanvas.tsx` — hide ZoomViewOverlay stop during simulation
5. `packages/web/app/lib/api.ts` — remove debug console.logs
6. `packages/web/app/api/simulate/route.ts` — remove debug console.logs
7. `packages/backend/src/routes/simulate.ts` — remove debug console.logs
8. `packages/backend/src/routes/simulateHandler.ts` — remove debug console.logs
