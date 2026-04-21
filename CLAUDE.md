# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Full check (format + lint + typecheck), you MUST run this after you think you have finished your changes
npm run check

# Individual checks
npm run format          # Prettier
npm run lint            # ESLint
npm run typecheck       # TypeScript (tsc -b, all packages)

# Build
npm run build           # All packages
npm run build:web       # Web package only

# API package
npm run typecheck -w packages/api
npm run test -w packages/api                          # Jest (ESM)
npm run test -w packages/api -- --testPathPattern=foo # Single test

# Web package
npm run dev -w packages/web     # Dev server on port 3101
npm run build -w packages/web
npm run typecheck -w packages/web
npm run lint -w packages/web
```

## Architecture

Monorepo (npm workspaces) with two packages:

- **`packages/api`** (`@daviddh/llm-graph-runner`) - State machine runtime that executes LLM graph workflows. Nodes represent agent steps, edges represent transitions with preconditions (`user_said`, `agent_decision`, `tool_call`). Key modules: `src/stateMachine/` (orchestration, graph traversal, prompt formatting).
- **`packages/web`** - Next.js 16 app (App Router, port 3101) providing a visual graph editor built with `@xyflow/react`. Users create/edit nodes and edges, validate graphs, and export JSON schemas.

### Path aliases

- API package: `@src/*` maps to `./src/*` (defined in `compilerOptions.paths`)
- Web package: `@/*` maps to `./*`

### Web package structure

- `app/components/` - Graph builder UI (nodes, edges, panels)
- `app/schemas/` - Zod validation schemas for graph data
- `app/utils/` - Graph validation, transformers (schema <-> React Flow), layout (Dagre)
- `app/data/` - Sample graph JSON files (ecommerce, airline)
- `components/ui/` - shadcn/ui components

### Graph data model

Graphs have **nodes** (kinds: `agent`, `agent_decision`, `tool`) and **edges** with preconditions. Three routing modes:
- `tool_call` - invoke external tools
- `agent_decision` - LLM selects next node
- `user_reply` - await user input

### Data access

- **Client components never talk to the database.** The data flow is: Client → Next.js backend (Server Components, Server Actions, Route Handlers) → dedicated backend. No direct Supabase calls from the browser.
- Auth flows (login, signup, OAuth, password reset) are the only exception — these use the Supabase browser client for auth token management.

### Supabase storage (image/file uploads)

When adding a new storage bucket for file uploads:

1. **Always create a SELECT policy** — even for public buckets. Supabase storage uses `INSERT ... RETURNING *` and upsert (`ON CONFLICT DO UPDATE ... RETURNING *`), which require SELECT permission on `storage.objects`. Without it, uploads fail with "new row violates row-level security policy".
2. **Use `SECURITY DEFINER` helpers** for RLS policies that need to look up data from other RLS-protected tables. A storage policy subquery like `SELECT org_id FROM tenants WHERE ...` will fail because the subquery runs under the user's RLS context. Create a `SECURITY DEFINER` function to bypass this.
3. **Use the single-argument `is_org_member(org_id)`** in storage policies (not the two-argument version with explicit `auth.uid()`). The 1-arg version calls `auth.uid()` internally within its `SECURITY DEFINER` context.
4. **Reference pattern**: see `org-avatars` bucket policies in `20260309400000_fix_storage_policies_and_publish.sql` and `tenant-avatars` in `20260331000000_tenants_table.sql`.

### Scroll containers (GlobalScrollbarOverlay tripwire)

`packages/web/app/components/GlobalScrollbarOverlay.tsx` attaches `OverlayScrollbars` (v2.x) to every element matching `.overflow-auto` / `.overflow-y-auto` / `.overflow-*scroll` via a document-wide `MutationObserver`. OS moves the target's children into its own internal viewport, so they are no longer DOM-level direct children of the element React rendered into.

**The tripwire:** any direct child of such a host that React later adds, removes, or whose *element type* changes (e.g. a component returning `<div>` in one branch and `<Provider>` in another) will crash with `Runtime NotFoundError: Failed to execute 'removeChild' on 'Node'`. Stack trace shows `commitDeletionEffectsOnFiber` → `removeChild` and just `at div (<anonymous>:null:null)` with no owner stack — don't let the opaque trace mislead you; it's a host/viewport mismatch, not a React bug.

**How to avoid it:**

- If the container doesn't actually need to scroll (inner children handle their own overflow), use `overflow-hidden` instead of `overflow-y-auto`. This is how the `MessageView` skeleton → Virtuoso crash was fixed in `ChatViewPanel`'s `CardContent`.
- If you need scroll *and* dynamic direct children (conditional `{x && <Y/>}`, a component whose root type varies by branch, list reorders/removals), use the `Scrollable` wrapper in `packages/web/app/components/Scrollable.tsx` — a thin wrapper around `OverlayScrollbarsComponent` with the `os-theme-closer` theme pre-wired. This is how the chat list in `ChatListPanel` was fixed (filter changes would remove `MessagePreview` buttons from a hijacked host and crash). Opt-out alternative: add `data-native-scroll` to the element (native browser scrollbar, no overlay theme).

**Reviewing new scroll containers:** scan their direct children. Stable DOM structure with only leaf mutations is fine. Root-type swaps, top-level conditionals that flip between `null` and rendered, and list re-renders where keys change are the danger.

## Code style and constraints

### ESLint (strict, do not disable)

- `max-lines-per-function`: 40 (skip blanks/comments)
- `max-lines`: 300 per file (skip comments)
- `max-depth`: 2
- When hitting line limits, extract helper functions or split files — never compress code onto single lines

### TypeScript

- Strict mode, `noUncheckedIndexedAccess` enabled
- Never use `any` — always use explicit types
- ESM modules (`"type": "module"`, NodeNext resolution)

### UI (web package)

- Always use shadcn/ui components from `components/ui/` — don't create from scratch
- Add new shadcn components: `npx shadcn@latest add <component-name>`
- Never use `!important` in CSS or Tailwind classes

### API (agent executor)

- This is where the agents are executed, with tools/mcps, and prompts are created.

### Internationalization

- Always add translations when adding user-facing text

### Formatting

- Prettier: single quotes, 2-space indent, 110 print width, trailing comma es5
- Import sorting via `@trivago/prettier-plugin-sort-imports`

## Design Context

See `.impeccable.md` for full design context. Key principles:

1. **Density with clarity** — Pack information tightly without sacrificing readability. Like Linear.
2. **Precision over decoration** — Crisp alignment, consistent spacing, typographic hierarchy over decorative elements.
3. **Progressive disclosure of power** — Simple at first glance, deep on exploration.
4. **Purposeful motion** — Snappy, functional animations that communicate state, never distract.
5. **Developer-grade polish** — Consistent, predictable, keyboard-friendly, visually coherent.

**Brand**: Precise, polished, dynamic. Developer tool with modern SaaS refinement.
**References**: Linear (density), Vercel/Stripe (polish), Retool/n8n (builder patterns).
**Anti-references**: Generic Bootstrap SaaS, enterprise clutter, toy-like whimsy, unpolished dev tools.
**Density**: Information-rich, compact components (h-7 buttons, xs-sm text, tight padding).
