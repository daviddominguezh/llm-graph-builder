# RU6 — Dead-code deletion / finalize — design

**Date:** 2026-06-26
**Status:** Design approved; pending implementation plan.
**Part of:** Runtime-unification decomposition — sub-project **RU6** (`2026-06-23-runtime-unification-OVERVIEW.md`). North-star: `2026-06-19-runtime-unification-design.md` §11.3.
**Depends on:** RU1–RU5 all merged and the **user's end-to-end gate passed** ([[ru-unification-merge-strategy]]). This is the **last, irreversible** sub-project.
**Context:** no prod users, solo dev, `main` frozen — so deletion is low-risk *operationally*, but irreversible *in-branch*; the safety net is the full test suite + reference checks, not a rollback.

## 1. Intent

RU1–RU5 each left their legacy code **in place behind re-export shims / parallel paths** so every step stayed independently reviewable and the migration never had a big-bang cutover. RU6 **deletes all of it at once, after everything else is proven** — collapsing the transition scaffolding into the final unified shape. Nothing here adds behavior; it only removes the now-dead old paths.

## 2. Scope

**Decisions (settled):**
- **(1) Immediate hard-delete, no soak window.** RU6 runs only after the user's end-to-end gate passes; there is no dormant-fallback period. The **recovery path is GitHub commit history** (any deleted code is recoverable from history) — combined with no prod users and the verified gate, the immediate cut is safe.
- **(2) Infra decommission is in scope** — not code-only. RU6 removes the edge functions from **Supabase cloud + CI/CD + env vars**, not just the source. (Code/config the agent edits: CI/CD deploy steps, `.env.example`/config references. Cloud-side actions the **user** performs, like migrations: deleting the deployed Supabase functions and removing cloud env vars — RU6 lists these as explicit user steps.)
- **(3) All deletions stay in RU6** — none pulled into their originating RU, to keep the single irreversible step quarantined.

**In:** delete the accumulated dead code from RU1–RU5 (the manifest, §3) + the edge infra decommission (§3), each deletion gated by a reference check (§4); keep the full suite green.

**Out:** any behavior change, refactor, or new feature. RU6 is deletion-only. If a "deletion" turns out to still be referenced by live code, that's a **bug in the upstream RU** to fix there — not something RU6 papers over.

## 3. The deletion manifest (by originating sub-project)

**From RU1 (shared-store-services):**
- The old backend `services/{kv,rag}StoreService.ts` + the **re-export shims** that pointed at `@daviddh/shared-store-services` during transition.
- The native `re2` remnants + the `/internal/regex/validate` route + its edge client usage (if any survived RU1).
- The partial `kvStoreService`/`ragStoreService` deletions flagged in north-star §11.3 — **run `find_referencing_symbols` first** (these were half-deleted historically).

**From RU2 (MCP pool):**
- `packages/backend/src/mcp/lifecycle.ts` (`createMcpSession`/`closeMcpSession`) + the old in-process connect paths, now that the pool owns connections and `ensureSession`/`sessionCache` were absorbed.

**From RU3 (runtime core + sim):**
- The **legacy sim orchestrators — both engines:** `simulationOrchestrator.ts` (+ helpers/types) and the legacy **`simulateHandler.ts` (workflow)** and **`simulateAgentHandler.ts` (agent)** paths, now that both run through the unified core behind the single sim API.
- The old `executeWithCallbacks`/`executeAgent` call sites that the `StepMachine` adapters replaced (keep the engine internals the adapters wrap; delete the *duplicated orchestration*).

**From RU4 (Worker + durable):**
- The entire Supabase Deno edge runtime: `supabase/functions/execute-agent/` + `supabase/functions/execute-tool/`.
- The legacy BE prod orchestrator `routes/execute/executeCore*.ts` (incl. `executeAgentCore` + the inline-dispatch suspend/resume) — deleted **entirely**, superseded by the Worker's durable `StepMachine`, plus the `edgeFunctionClient` edge-URL remnants. **Survivor:** the BE→Worker entry is RU4's new `invokeWorker` (used by `handleExecute` + the triggers fire path) — that is **kept**, not part of this deletion.

**From RU5 (SSE):**
- Anything the RU5 cutover left (RU5 deletes the SSE shapes/writers it directly replaces; RU6 sweeps any stragglers) — e.g. the `executeTypes.ts` internal shape if RU5 didn't fully remove it. **`PublicExecutionEvent` is NOT deleted** (decision B — it's the public projection target).

**Edge infra decommission (decision 2):**
- **Only `execute-agent` + `execute-tool` are removed. `supabase/functions/vfs-cleanup` is a THIRD edge function that stays** — so shared edge infra is removed only *conditionally* on `vfs-cleanup` not needing it.
- **Agent-editable (code/config):** remove the edge-function **CI/CD deploy steps** if any are function-named (the CI loops generically over `supabase/functions/*`, so deleting the two dirs is usually what removes them from deploy — verify); remove `supabase/config.toml` entries for the two functions **if present** (they may not exist — verify-then-no-op); keep `supabase/functions/deno.json` and any `.env.example` edge refs **if `vfs-cleanup` still uses them** (only remove what's exclusively `execute-agent`/`execute-tool`).
- **User-performed (cloud-side, like migrations):** delete the deployed `execute-agent` / `execute-tool` functions from the **Supabase dashboard/CLI**, and remove their **cloud env vars** + any edge-only secrets. RU6 lists these as explicit user steps; the agent does not touch the live Supabase project.

## 4. Verification protocol (per deletion)

Each deletion is gated, not bulk-`rm`'d:
1. **`find_referencing_symbols` (Serena)** on every symbol/module before deleting it — zero live references outside other to-be-deleted code.
2. Delete, then `npm run check` (format + lint + typecheck — typecheck catches dangling imports) + the **full test suite**.
3. Commit per logical group (RU1 remnants, RU2 lifecycle, RU3 orchestrators, RU4 edge, RU5 stragglers) so a regression bisects to a small deletion.
4. **A surviving reference = stop and fix the upstream RU**, don't delete-and-stub. The whole point of doing this last is that nothing live should point at the dead code.

## 5. Ordering

RU6 runs **only after RU1–RU5 are merged and the user's end-to-end test passes** — durable suspend/resume (RU4) and all three real consumers + the public projection (RU5) must be verified working, because once the edge functions and legacy orchestrators are gone there is no fallback path. Within RU6, order by dependency (delete leaf consumers before the modules they import) so each `npm run check` stays green.

## 6. Risks / open questions

- **Irreversibility.** No in-product rollback once the edge + legacy orchestrators are deleted — but the **recovery path is GitHub commit history** (deleted code is recoverable from history), which combined with the verified gate + no prod users makes the immediate cut safe (decision 1). Further mitigated by: this being last, per-symbol reference checks, per-group commits, and the green-suite gate.
- **Half-deleted history (§11.3).** The `kv`/`rag` store services were partially deleted before — `find_referencing_symbols` is mandatory there to avoid deleting something still half-wired.
- **Edge function infra (now in scope — decision 2).** Decommission spans code + CI/CD + Supabase cloud + env vars (§3). Before removal, confirm nothing (cron, webhook, dashboard, the BE's `edgeFunctionClient`) still invokes the edge. The cloud-side deletions are explicit **user** steps (like migrations).
- **`mcp/lifecycle.ts` stragglers.** The sim path used `createMcpSession` directly (`simulateHandler.ts`); confirm RU2/RU3 fully rerouted it through the pool before deleting `lifecycle.ts`.
- **Don't over-delete engine internals.** RU3's `StepMachine` *wraps* `executeAgentLoop`/`executeWithCallbacks` — delete the duplicated *orchestration*, keep the engines themselves.

## 7. Affected paths (deletions — selection)

- `supabase/functions/execute-agent/**`, `supabase/functions/execute-tool/**`
- `packages/backend/src/mcp/lifecycle.ts`
- `packages/backend/src/routes/{simulationOrchestrator*,simulateHandler,simulateAgentHandler,simulateAgentSse,simulateAgentTypes}.ts` (legacy paths) + `sseSimComposition`/`api.ts` legacy remnants RU5 didn't take
- `packages/backend/src/routes/execute/executeCore*.ts` + `executeTypes.ts` internal shapes
- `packages/backend/src/services/{kv,rag}StoreService.ts` re-export shims; native `re2` + `/internal/regex/validate`
- **Kept:** `PublicExecutionEvent` (B), the engine internals (`executeAgentLoop`/`executeWithCallbacks`), `@daviddh/shared-store-services`, the pool, the Worker.
