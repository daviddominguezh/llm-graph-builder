# RU6 — Dead-code deletion / finalize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard-delete the dead code RU1–RU5 left behind their re-export shims / parallel paths — the legacy store-service implementations, native `re2` + `/internal/regex/validate`, `mcp/lifecycle.ts`, both legacy sim orchestrators, the legacy prod `executeCore*` orchestrator + `edgeFunctionClient`, the Supabase Deno edge runtime (`execute-agent` + `execute-tool`), and any RU5 SSE stragglers — plus decommission the edge-function infra (CI/CD + `.env.example`), keeping the full suite green. RU6 is **deletion-only**: it adds no behavior.

**Architecture:** Each deletion is gated, not bulk-`rm`'d. The deletion-adapted TDD cycle per task is: **(1) reference check** — `find_referencing_symbols` (Serena) / `grep` proving zero LIVE references outside other to-be-deleted code (the command is shown with its expected "no matches"); **(2) delete** the file(s)/symbol(s); **(3) verify** — `npm run check` (typecheck catches dangling imports) + the relevant test suite, expected green; **(4) commit** per logical group. A surviving live reference is **STOP-and-fix-the-upstream-RU**, never delete-and-stub. Tasks are ordered so each `npm run check` stays green (delete leaf consumers before the modules they import). Cloud-side Supabase deletions are listed as explicit **USER** steps — the agent does not touch the live Supabase project. **Recovery path is GitHub commit history** (decision 1); there is no soak window and no in-product rollback.

**Tech Stack:** TypeScript (strict, NodeNext ESM), npm workspaces monorepo (`packages/{api,backend,web,widget,worker,shared-store-services,...}`), Jest (ESM), Express (BE), Supabase (Postgres + edge functions being decommissioned), Cloudflare Worker (RU4 prod host, kept), `@xyflow/react` (web). Serena MCP for symbol-level reference checks.

## Global Constraints

- Monorepo, npm workspaces. ESM, `"type":"module"`, NodeNext resolution.
- TypeScript strict, `noUncheckedIndexedAccess`. **Never use `any`. Never add eslint-disable.**
- ESLint: `max-lines-per-function` 40, `max-lines` 300, `max-depth` 2 — split into helper functions/files rather than compressing lines. (RU6 deletes code, so it should only *relieve* these; never compress to satisfy them.)
- Tests: Jest (ESM) — `npm run test -w packages/<pkg> -- --testPathPattern=…`. Full check: `npm run check` (format+lint+typecheck). `npm run check` is **the gate** after every deletion.
- Stage files explicitly (`git add <path> …`); **never** `git add -A` / `git commit -am` — unrelated in-flight work must not be swept in.
- Migrations are **written, not applied**; cloud-side Supabase actions (function deletes, cloud env vars) are **USER** steps.
- Always maintain translations — RU6 deletes code, so if a deletion orphans an i18n key, remove the key in the same commit (no orphans, no new copy).
- Prettier: single quotes, 2-space, width 110, trailing comma es5; `@trivago` import sorting.
- Commit message trailer (every commit): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

### Precondition gate (BLOCKING — read before any task)

RU6 runs **only after RU1–RU5 are all merged and the user's end-to-end gate has passed** (OVERVIEW §"Sub-projects", RU6 spec §1, §5). Concretely, before deleting anything the implementer MUST confirm the RU1–RU5 replacements exist and own the live paths:

- RU1: `packages/shared-store-services` exists and the BE/edge import from `@daviddh/shared-store-services`; `re2js` replaced native `re2`.
- RU2: `packages/backend/src/mcp/pool/` exists and owns connections; `McpPoolClient` is wired into the runtime/sim call sites.
- RU3: the `packages/api` core (`executeAgent`/`executeTurn`/`DispatchStrategy`/`StepMachine` adapters) drives the simulation path; `simulationOrchestrator`/`simulateHandler`/`simulateAgentHandler` are no longer reachable.
- RU4: `packages/worker` runs the durable `StepMachine` and the `edgeFunctionClient` → Worker flip has landed; prod no longer dispatches through `executeCore*` / the edge functions.
- RU5: the superset `ExecutionEvent` + `executionEventSse.ts` serializer have cut over all three consumers; legacy SSE shapes/writers are gone except `PublicExecutionEvent` (kept, decision B).

**If any precondition is unmet, STOP. Do not delete.** Per spec §4/§5 a surviving live reference means the upstream RU is incomplete; RU6 does not paper over it. See **Self-review → Branch-state FLAG**: at the time this plan was written, none of the RU1–RU5 replacements existed in the working branch, so every Step-1 reference check below currently returns LIVE references and every delete is currently blocked. Re-run the reference checks against the post-RU5-merge tree before executing.

---

## File Structure

This plan **removes** files; it creates none. The deletion manifest (RU6 spec §3, §7), grouped by originating sub-project. Each path was confirmed to exist in the working branch at plan-authoring time unless a FLAG notes otherwise.

**RU1 — shared-store-services + re2js remnants**
- `packages/backend/src/services/kvStoreService.ts` (+ `.test.ts`) — legacy KV factory (currently the live impl; should be a re-export shim post-RU1).
- `packages/backend/src/services/ragStoreService.ts` (+ `.test.ts`) — legacy RAG factory (same).
- Native `re2` usages: the `import RE2 from 're2'` + `preValidateRegex` in `kvStoreService.ts`; `packages/backend/src/rag/search/regex.ts` (+ `.test.ts`) if still RE2-based; the `re2` dependency in `packages/backend/package.json`.
- `/internal/regex/validate` route + its handler in `packages/backend/src/routes/internal/internalRouter.ts` + `routes/internal/utilityHandlers.ts` (+ tests `authGate.test.ts`, `utilityHandlers.test.ts`) and any edge client that called it.
- §11.3 partial `kv`/`rag` deletions — **`find_referencing_symbols` first** (half-deleted historically).

**RU2 — MCP pool**
- `packages/backend/src/mcp/lifecycle.ts` — `createMcpSession` / `closeMcpSession` + the old in-process connect paths (confirm the pool + RU3 fully rerouted `simulateHandler.ts`'s and `mcp-server/services/simulateService.ts`'s direct `createMcpSession` use first).

**RU3 — runtime core + sim**
- `packages/backend/src/routes/simulationOrchestrator.ts` + `simulationOrchestratorHelpers.ts` + `simulationOrchestratorTypes.ts` + `simulationServicesResolver.ts` (legacy orchestrator binding to the legacy store services).
- `packages/backend/src/routes/simulateHandler.ts` (legacy workflow sim) — **note: modified on the current branch (in `git status`); confirm it is the legacy path RU3 replaced, not new RU3 wiring, before deleting.**
- `packages/backend/src/routes/simulateAgentHandler.ts` (legacy agent sim) + `simulateAgentSse.ts` / `simulateAgentTypes.ts` legacy paths.
- The duplicated orchestration `executeWithCallbacks` / `executeAgent` **call sites** the `StepMachine` adapters replaced. **KEEP the engine internals** (`executeAgentLoop` / `executeWithCallbacks` in `packages/api`).

**RU4 — Worker + durable**
- `supabase/functions/execute-agent/**` and `supabase/functions/execute-tool/**` (entire Deno runtimes, incl. their per-function `deno.json`).
- `packages/backend/src/routes/execute/executeCore.ts` + `executeCoreHelpers.ts` + `executeCoreChildFinish.ts` + `executeCoreSetup.ts` + `executeCoreTypes.ts` + `executeCoreInlineDispatch.ts` (+ `.test.ts`) — legacy inline-dispatch suspend/resume orchestrator.
- `packages/backend/src/routes/execute/edgeFunctionClient.ts` + `edgeFunctionAgentEvents.ts` + `edgeFunctionOutputParsers.ts` — edge-URL remnants.

**RU5 — SSE stragglers**
- Any SSE shapes RU5 didn't take — e.g. the internal-shape portions of `packages/backend/src/routes/execute/executeTypes.ts`. **KEEP `PublicExecutionEvent`** (decision B — public projection target; referenced by `mockExecute/*`, `executeHelpers.ts`).

**Edge infra decommission (agent-editable)**
- `supabase/functions/deno.json` (shared Deno config for the deleted functions) — delete only if no surviving function (`vfs-cleanup`) needs it.
- `.github/workflows/ci.yaml` `deploy-functions` job edge-deploy steps for `execute-agent`/`execute-tool` (FLAG: loop is generic — see §below).
- `supabase/config.toml` `[functions.*]` entries for `execute-agent`/`execute-tool` (FLAG: none currently exist — see §below).
- `packages/backend/.env.example` edge env refs: `SUPABASE_EDGE_FUNCTION_URL`, `EDGE_FUNCTION_MASTER_KEY` (delete only if no surviving consumer).

**USER-performed (cloud-side)** — listed in the final task, not executed by the agent.

---

## Tasks

> Order: RU1 leaf consumers → RU2 → RU3 → RU4 → RU5 stragglers → infra. Within a group, delete consumers before imported modules so each `npm run check` stays green. **Every Step-1 reference check that returns a LIVE reference = STOP, fix the upstream RU (do not delete).**

### Task 1 — RU1: delete legacy `kvStoreService` / `ragStoreService` + their tests

- [ ] **Reference check.** Run, expecting **no matches** (or only matches inside other to-be-deleted RU6 targets):
  - `mcp__serena__find_referencing_symbols` on `makeKvStoreService` (file `packages/backend/src/services/kvStoreService.ts`) and `makeRagStoreService` (`ragStoreService.ts`).
  - `grep -rn "kvStoreService\|ragStoreService\|makeKvStoreService\|makeRagStoreService" packages/backend/src --include="*.ts"`.
  - **Expected post-RU1:** consumers import from `@daviddh/shared-store-services`; the only references are the legacy `simulationServicesResolver.ts` (also deleted, Task 5) and the files' own tests. **If a live consumer remains → STOP (RU1 incomplete).**
- [ ] **§11.3 half-deletion guard.** `find_referencing_symbols` on each symbol the §11.3 manifest flagged as partially deleted before deleting it; confirm no half-wired remnant.
- [ ] **Delete** `kvStoreService.ts`, `kvStoreService.test.ts`, `ragStoreService.ts`, `ragStoreService.test.ts`.
- [ ] **Verify** `npm run check` + `npm run test -w packages/backend` → green.
- [ ] **Commit** (RU1 store services): stage the four paths explicitly.

### Task 2 — RU1: remove native `re2` + `/internal/regex/validate` hop

- [ ] **Reference check.** `grep -rln "from 're2'\|require('re2')\|\bRE2\b" packages/backend/src --include="*.ts"` and `grep -rn "regex/validate\|/internal/regex/validate" packages/backend/src --include="*.ts"`.
  - **Expected post-RU1:** zero — `re2js` replaced native `re2` and the validate hop was dropped. Confirm `rag/search/regex.ts` is `re2js`-based (not native `RE2`). **If native `re2` / the route survive in live code → STOP (RU1 incomplete).**
- [ ] **Delete / edit:** remove the `/internal/regex/validate` route registration from `routes/internal/internalRouter.ts`, its handler from `routes/internal/utilityHandlers.ts`, and the matching test cases in `authGate.test.ts` / `utilityHandlers.test.ts`; remove the native `re2` dependency from `packages/backend/package.json` (and lockfile via `npm install`). Remove any edge client call to the validate hop.
- [ ] **Verify** `npm run check` + `npm run test -w packages/backend` → green.
- [ ] **Commit** (RU1 re2/regex-validate): stage the edited router/handlers/tests + `package.json` + lockfile explicitly.

### Task 3 — RU2: delete `mcp/lifecycle.ts` (`createMcpSession` / `closeMcpSession`)

- [ ] **Reference check.** `mcp__serena__find_referencing_symbols` on `createMcpSession` and `closeMcpSession` (file `packages/backend/src/mcp/lifecycle.ts`); `grep -rn "createMcpSession\|closeMcpSession\|mcp/lifecycle" packages/backend/src --include="*.ts"`.
  - **Expected post-RU2/RU3:** the only references are inside already-deleted or about-to-be-deleted RU6 targets. Today the LIVE references are `mcp-server/services/simulateService.ts`, `routes/simulateHandler.ts`, and `lib/assertEgressForServers.ts` (doc-comment) + their tests. **`simulateService.ts` and `simulateHandler.ts` must be rerouted through the RU2 pool first → if either still calls `createMcpSession` for real, STOP (RU2/RU3 incomplete).**
- [ ] **Delete** `packages/backend/src/mcp/lifecycle.ts`.
- [ ] **Verify** `npm run check` + `npm run test -w packages/backend` → green.
- [ ] **Commit** (RU2 lifecycle): stage `mcp/lifecycle.ts` explicitly.

### Task 4 — RU3: delete legacy agent sim path (`simulateAgentHandler` + SSE/types)

- [ ] **Reference check.** `find_referencing_symbols` on the `simulateAgentHandler` export and `simulateAgentSse` / `simulateAgentTypes` exports; `grep -rn "simulateAgentHandler\|simulateAgentSse\|simulateAgentTypes" packages/backend/src --include="*.ts"`.
  - **Expected post-RU3:** the agent sim runs through the unified core; the only references are the router entry being removed and the other legacy sim files (deleted in Task 5). **If a live route still serves the legacy agent sim → STOP (RU3 incomplete).**
- [ ] **Delete** `simulateAgentHandler.ts`; delete `simulateAgentSse.ts` / `simulateAgentTypes.ts` **only the legacy portions** RU3/RU5 replaced (FLAG if these still carry live shared types — see Self-review). Remove the legacy agent-sim route registration.
- [ ] **Verify** `npm run check` + `npm run test -w packages/backend` → green.
- [ ] **Commit** (RU3 agent sim): stage explicitly.

### Task 5 — RU3: delete legacy workflow sim orchestrator (`simulationOrchestrator*` + `simulateHandler` + resolver)

- [ ] **Reference check.** `find_referencing_symbols` on `simulateHandler`, the `simulationOrchestrator` exports, `simulationOrchestratorHelpers`, `simulationOrchestratorTypes`, `simulationServicesResolver`; `grep -rn "simulationOrchestrator\|simulateHandler\|simulationServicesResolver" packages/backend/src --include="*.ts"`.
  - **Expected post-RU3:** the only live registration is `server.ts` → `simulateHandler`, which RU3 should have repointed at the unified sim API. **Confirm `simulateHandler.ts` (modified on this branch) is the legacy path, not new RU3 wiring**, before deleting. If `server.ts` still mounts the legacy handler as the real sim entry → STOP (RU3 incomplete).
- [ ] **Delete** `simulationOrchestrator.ts`, `simulationOrchestratorHelpers.ts`, `simulationOrchestratorTypes.ts`, `simulationServicesResolver.ts`, `simulateHandler.ts`; remove the legacy mount from `server.ts`. Delete the duplicated orchestration `executeWithCallbacks`/`executeAgent` **call sites** the `StepMachine` adapters replaced — **keep the `packages/api` engine internals.**
- [ ] **Verify** `npm run check` + `npm run test -w packages/backend` → green.
- [ ] **Commit** (RU3 workflow sim): stage explicitly.

### Task 6 — RU4: delete legacy prod orchestrator (`executeCore*` + `edgeFunctionClient`)

- [ ] **Reference check.** `find_referencing_symbols` on the `executeCore*` exports and `edgeFunctionClient` / `edgeFunctionAgentEvents` / `edgeFunctionOutputParsers`; `grep -rn "executeCore\|edgeFunctionClient\|edgeFunction" packages/backend/src --include="*.ts"`.
  - **Expected post-RU4:** prod dispatches through the Worker's durable `StepMachine`; the only references are intra-group (each other) + their tests. **If `executeHandler.ts` / the prod route still dispatches through `executeCore*` or `edgeFunctionClient` → STOP (RU4 incomplete; the Worker flip didn't land).**
- [ ] **Delete** `executeCore.ts`, `executeCoreHelpers.ts`, `executeCoreChildFinish.ts`, `executeCoreSetup.ts`, `executeCoreTypes.ts`, `executeCoreInlineDispatch.ts` (+ its test), `edgeFunctionClient.ts`, `edgeFunctionAgentEvents.ts`, `edgeFunctionOutputParsers.ts`. Remove dangling imports from any surviving execute-route file (typecheck will surface them).
- [ ] **Verify** `npm run check` + `npm run test -w packages/backend` → green.
- [ ] **Commit** (RU4 prod orchestrator): stage explicitly.

### Task 7 — RU4: delete the Supabase Deno edge runtimes (`execute-agent` + `execute-tool`)

- [ ] **Reference check.** `grep -rn "execute-agent\|execute-tool" packages/ supabase/config.toml .github --include="*.ts" --include="*.toml" --include="*.yaml"` and confirm no BE code, cron, webhook, or dashboard reference invokes them (RU6 §6). The `edgeFunctionClient` caller is already gone (Task 6). **`vfs-cleanup` is NOT in scope — keep it.**
- [ ] **Delete** `supabase/functions/execute-agent/**` and `supabase/functions/execute-tool/**` (entire trees incl. per-function `deno.json`).
- [ ] **Verify** `npm run check` (TS packages) → green; the Deno functions are not in the TS build, so also `git status` to confirm only intended trees were removed.
- [ ] **Commit** (RU4 edge runtime): stage the two function dirs explicitly.

### Task 8 — RU5: sweep SSE stragglers (`executeTypes.ts` internal shape)

- [ ] **Reference check.** `find_referencing_symbols` on the internal (non-public) SSE shapes in `routes/execute/executeTypes.ts`; `grep -rn "<internal-shape-name>" packages/backend/src packages/web packages/widget --include="*.ts"`.
  - **Expected post-RU5:** all three consumers emit/consume the superset `ExecutionEvent` via `executionEventSse.ts`; the internal shape is dead. **KEEP `PublicExecutionEvent`** (decision B — still referenced by `mockExecute/*`, `executeHelpers.ts`). **If a live consumer still reads the internal shape → STOP (RU5 incomplete).**
- [ ] **Delete** only the dead internal-shape members of `executeTypes.ts` (and any RU5-leftover writer); leave `PublicExecutionEvent` intact.
- [ ] **Verify** `npm run check` + `npm run test -w packages/backend` (+ `-w packages/web`, `-w packages/widget` if touched) → green.
- [ ] **Commit** (RU5 stragglers): stage explicitly.

### Task 9 — Edge infra decommission (agent-editable: CI/CD, deno.json, .env.example)

- [ ] **Reference check.** Confirm `execute-agent`/`execute-tool` no longer exist on disk (Task 7) and that the only remaining edge function is `vfs-cleanup`.
- [ ] **CI/CD** (`.github/workflows/ci.yaml`): the `deploy-functions` job loops generically over `find supabase/functions -mindepth 1 -maxdepth 1 -type d`, so removing the function dirs already stops their deploy — **there are no per-function deploy steps to delete** (FLAG, see Self-review). Verify the loop still works for `vfs-cleanup` and that no env-var / secret referenced **only** by the deleted functions lingers in the workflow.
- [ ] **`supabase/config.toml`:** there are currently **no `[functions.execute-agent]` / `[functions.execute-tool]` entries** to remove (FLAG, see Self-review). If RU1–RU5 added any, remove them; otherwise no-op.
- [ ] **`supabase/functions/deno.json`:** delete **only if** `vfs-cleanup` does not depend on it (it has its own `vfs-cleanup/deno.json`). Confirm, then delete or keep.
- [ ] **`packages/backend/.env.example`:** remove `SUPABASE_EDGE_FUNCTION_URL` and `EDGE_FUNCTION_MASTER_KEY` **only if** no surviving code reads them (grep the env-var names across `packages/backend/src`; if `vfs-cleanup` invocation or anything else still uses them, keep). Update any inline comments.
- [ ] **Verify** `npm run check` → green; CI workflow YAML lints / parses.
- [ ] **Commit** (edge infra decommission): stage `ci.yaml`, `config.toml` (if changed), `deno.json` (if deleted), `.env.example` explicitly.

### Task 10 — USER steps: cloud-side Supabase decommission (documented, NOT executed)

- [ ] **Do not execute.** Record the following as explicit **user** steps (the agent does not touch the live Supabase project), mirroring how migrations are user-applied:
  - Delete the deployed `execute-agent` and `execute-tool` edge functions from the Supabase dashboard / CLI (`supabase functions delete execute-agent`, `supabase functions delete execute-tool`) — for the prod project and any preview branches.
  - Remove their **cloud env vars / edge-only secrets** (e.g. `EDGE_FUNCTION_MASTER_KEY`, `SUPABASE_EDGE_FUNCTION_URL` and any function-scoped secrets) from the Supabase project settings.
  - Confirm no cron / webhook / dashboard trigger still invokes the deleted functions before removing the secrets.
- [ ] **Commit** none for this task (documentation/handoff only); the steps live in this plan + the PR description for the user to action.

---

## Self-review

### Spec §3 manifest → task mapping

| §3 manifest item | Task |
| --- | --- |
| RU1: legacy `kvStoreService` / `ragStoreService` + re-export shims | Task 1 |
| RU1: §11.3 partial `kv`/`rag` deletions (`find_referencing_symbols` first) | Task 1 (guard step) |
| RU1: native `re2` remnants + `/internal/regex/validate` route + edge client usage | Task 2 |
| RU2: `mcp/lifecycle.ts` (`createMcpSession`/`closeMcpSession`) + in-process connect paths | Task 3 |
| RU3: legacy agent sim (`simulateAgentHandler` + SSE/types) | Task 4 |
| RU3: legacy workflow sim orchestrators (`simulationOrchestrator*`, `simulateHandler`) | Task 5 |
| RU3: duplicated `executeWithCallbacks`/`executeAgent` call sites (engine internals KEPT) | Task 5 |
| RU4: Supabase Deno edge runtime (`execute-agent` + `execute-tool`) | Task 7 |
| RU4: legacy prod orchestrator `executeCore*` + `edgeFunctionClient` remnants | Task 6 |
| RU5: SSE stragglers (`executeTypes.ts` internal shape); `PublicExecutionEvent` KEPT (decision B) | Task 8 |
| Edge infra (agent-editable): CI/CD deploy, `deno.json`, `.env.example` edge refs | Task 9 |
| Edge infra (user-performed): cloud function deletes + cloud env vars | Task 10 |

Every §3 manifest item maps to a task. No placeholders. Deletion order (leaf consumers → imported modules; RU1→RU5→infra) keeps `npm run check` green at each step.

### Kept (must NOT be deleted)

`PublicExecutionEvent` (decision B), the engine internals `executeAgentLoop` / `executeWithCallbacks` (RU3's `StepMachine` wraps them), `@daviddh/shared-store-services` (RU1), the MCP pool (RU2), the Worker (RU4), and the out-of-scope `supabase/functions/vfs-cleanup`.

### Ordering / gate

RU6 runs **only after RU1–RU5 are merged and the user's end-to-end gate passes** (spec §1, §5; OVERVIEW dependency graph `RU1/RU2 → RU3 → RU4 → RU5 → RU6`). Each deletion is gated by a reference check; a surviving live reference = STOP and fix the upstream RU (spec §4). Recovery path is GitHub history (decision 1); irreversible in-branch.

### Branch-state FLAG (spec-vs-code contradiction — do NOT silently fix)

At plan-authoring time, the working branch (`feat/data-tools`) does **not** contain the RU1–RU5 replacements the manifest presumes. Verified:
- **No `packages/shared-store-services`, no `@daviddh/shared-store-services` imports.** `kvStoreService.ts` / `ragStoreService.ts` are the full LIVE implementations, not re-export shims. RU1 not merged.
- **No `packages/backend/src/mcp/pool/`.** `createMcpSession` is the LIVE connect path, called by `mcp-server/services/simulateService.ts` and `routes/simulateHandler.ts`. RU2 not merged.
- **No `StepMachine` anywhere; `simulationServicesResolver.ts` still binds the legacy store services; `server.ts` still mounts `simulateHandler`.** RU3 not merged.
- **No `packages/worker`; `executeCore*` + `edgeFunctionClient` are the LIVE prod dispatch path.** RU4 not merged.
- **Native `re2` still imported in `kvStoreService.ts` and `rag/search/regex.ts`; `/internal/regex/validate` style internal utility handlers present.** `re2js` cutover not merged.

**Consequence:** if executed against this branch, every Task's Step-1 reference check returns LIVE references and every delete is **correctly blocked** by the spec's STOP rule. This is the intended guardrail, not a defect in the plan — RU6 must execute only on a tree where RU1–RU5 have merged. Re-run all reference checks post-merge.

### Infra FLAGs (spec-vs-code contradiction)

- **Spec §3/§7 says remove edge-function `[functions.*]` entries from `supabase/config.toml`** — **none exist** in the current `config.toml` (no `[functions.execute-agent]` / `[functions.execute-tool]`). Task 9 is a verify-then-no-op here unless RU1–RU5 add them. (FLAG; not invented.)
- **Spec §3 says remove the edge "CI/CD deploy steps"** — the `deploy-functions` job in `.github/workflows/ci.yaml` is **generic** (loops over every dir under `supabase/functions`); there are no per-function deploy steps. Deleting the function dirs (Task 7) is what removes them from deploy. Task 9 verifies the generic loop, it does not delete named steps. (FLAG.)
- **`supabase/functions/vfs-cleanup` is a third edge function NOT in the RU6 manifest** — it (and its `deno.json`, and possibly `SUPABASE_EDGE_FUNCTION_URL` / `EDGE_FUNCTION_MASTER_KEY`) must be preserved; `.env.example` and `supabase/functions/deno.json` removals in Task 9 are conditional on `vfs-cleanup` not needing them. (FLAG; affects "delete `deno.json` / env refs" being unconditional in the spec.)

---

## Integration note: executeCore deletion + `invokeWorker` (spec §3 update)

The `executeCore*` deletion (Task 6) removes `executeAgentCore` **entirely** — but `handleExecute` AND the triggers fire path call it to reach the Worker. RU4 introduces a **new `invokeWorker`** as that BE→Worker entry (RU4 plan "Integration" note). So Task 6's reference check must confirm **both** call sites — `handleExecute` and `fireHandler.ts` (`defaultExecute`) — have switched to `invokeWorker` before deleting `executeCore*`. `invokeWorker` is **kept**, not deleted.
