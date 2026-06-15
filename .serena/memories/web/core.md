# Web Package

Next.js 16 App Router, port 3101, `--webpack`. Visual graph editor on `@xyflow/react`.

## Structure
- `app/components/` — graph builder UI (nodes, edges, panels), copilot, agents.
- `app/schemas/` — Zod graph schemas (`graph.schema.ts`). Node kinds: `agent`, `agent_decision`, `tool`. All preconditions in one edge share the same type.
- `app/utils/` — graph validation, transformers (schema↔React Flow), Dagre layout.
- `app/data/` — sample graph JSON (ecommerce, airline).
- `components/ui/` — shadcn/ui components. shadcn built on `@base-ui/react`, NOT radix. Add via `npx shadcn@latest add <name>`. Always reuse these, don't hand-roll.

## OverlayScrollbars removeChild tripwire (real, recurring crash)
`app/components/GlobalScrollbarOverlay.tsx` attaches OverlayScrollbars to every `.overflow-auto`/`.overflow-y-auto`/`.overflow-*scroll` via document-wide MutationObserver, moving children into an internal viewport. Any direct child of such a host that React adds/removes/swaps element-type → `NotFoundError: removeChild` crash (opaque trace: `commitDeletionEffectsOnFiber`→`removeChild`, `at div`).
Avoid: use `overflow-hidden` if inner children handle their own overflow; OR use the `Scrollable` wrapper (`app/components/Scrollable.tsx`, theme `os-theme-closer`) for scroll + dynamic direct children; OR `data-native-scroll` opt-out.
When adding a scroll container: audit direct children — root-type swaps, top-level `{cond && <X/>}`↔null, and keyed list reorders are the danger; leaf-only mutations are safe.

## Supabase storage policies
New upload bucket needs a SELECT policy (uploads use INSERT/upsert RETURNING). Use `SECURITY DEFINER` helpers for RLS subqueries against other RLS tables; use 1-arg `is_org_member(org_id)`. Self-referencing `org_members` RLS recurses → needs SECURITY DEFINER helpers.

Shared rules in `mem:conventions`; data-flow invariant in `mem:core`.
