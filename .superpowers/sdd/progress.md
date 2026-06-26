# Triggers SDD progress

Plan: docs/superpowers/plans/2026-06-24-triggers-event-driven-scheduler.md
Branch: feat/data-tools

Task A1: complete (commit 4f31865a, review clean — quality Approved)
  Minor (for final review): drop z.ZodType<TriggerSchedule> annotation (schedule.ts:157); applyJitter lower-bound assumes whole-second input (safe for real callers); unused dayjs import in schedule.test.ts:1
Task A2: complete (commit 625b860b, review clean — quality Approved; +tsconfig subpath path map, stripId initialMessage, import/first reorder — all verified correct)
Phase B (Tasks B1+B2): complete (commits 29f38414, c12364b4 — review clean, quality Approved)
  Minor — FIX BEFORE APPLY (final review): (1) add 'CREATE EXTENSION IF NOT EXISTS pg_cron;' atop B2 (defensive convention); (2) partition bounds use session TZ — make 'p_day::timestamptz' explicit UTC. (3) unused old_part var in maintain_trigger_runs.
Task C1: complete (commit 7ba97186, review clean — quality Approved; adaptCloudTasksClient mapping verified vs @google-cloud/tasks v6.2.3)
  Minor (final review): adaptCloudTasksClient/toCreateTaskRequest has no unit test (verified correct, cover at C4/C5 integration); CloudTasksConfig.serviceAccount unused (reserved for future OIDC)
Task C2: complete (commit 19d46077, review clean — quality Approved; TriggerRow verified vs migration)
  DOWNSTREAM (C3): recordOutcome uses object param {runId,status,failureReason?,error?}; claimAndRearm→{result:{runId,sessionId}|null,error}; getTriggerById/isTriggerEnabled/setArmedTaskEpoch present. Minor (final): 2 narrowing casts (stylistic).
NOTE [2026-06-25]: user APPLIED migrations 20260624000000/001. Migration files now immutable — do NOT edit them. Phase B Minor findings resolved: (1) pg_cron CREATE EXTENSION moot (applied clean ⇒ already present); (2) partition-bound TZ fine on Supabase UTC default; (3) unused old_part cosmetic. Any future change needs a NEW migration.
Task C3: complete (commit 7caca175, review clean — quality Approved; claim-first ordering + continuation gate + hop math verified)
  Minor (final fix-wave): (1) remove dead export resolveExecutionContext (fireHelpers); (2) add negative-path test: executor reject/timeout -> recordOutcome status:'failed' (path verified-correct but untested).
  CARRY-FORWARD: C4 createTrigger + enable use armToward (C3 fireHelpers, committed) + getTriggerScheduler (C1); C4/C5 need jitterWindowMs + horizonMs config (none exists yet).
Task C4: complete (commits 5945bfd4 + fix fe53af5f, review clean — Approved; id?/seed-consistency verified; stale-response Important FIXED + re-reviewed Resolved)
  Minor (final): delete ignores getTriggerById error (best-effort); EMPTY_RECURRING placeholder; setTriggerEnabled test covers disable path only; no delete/list handler tests.
Task C5: complete (commit e74ccc97, review clean — Approved; lazy/memoized dep construction verified, allowlist correct). *** PHASE C (BACKEND) COMPLETE — 731 backend tests pass. ***
Task D1: complete (commit 5271cc12, review clean — Approved; TriggerRow wire-parity verified, proxyToBackend-204 deviation correct). Note for D3/D4: read res.result; armed_task_epoch/run_count/last_* are read-only server-managed.
Task D2: complete (commit 86de5a6f — controller-verified: 13 i18n keys added, JSON valid, 13 ins/0 del, en.json only). No full review (content-only, near-zero risk).
Task D3: complete (commit b5a584e1, review clean — Approved; behavior-preserving extraction + create-disabled gate verified). Minor (final): remove unused isEdit prop on StepFooter.
Task D4: complete (commit b0082f46, review clean — Approved; stale-cancel + optimistic-revert verified; edit path removed). *** ALL IMPLEMENTATION TASKS DONE (A1-A2,B1-B2,C1-C5,D1-D4). ***
  Minor (final review): orphaned previewAfterEvent i18n key; theoretical setEnabled revert race; remove now-unused in-memory Trigger type + nextRun.ts shim (preview still uses computePreviewRuns via ScheduleStep — verify before deleting nextRun.ts); remove unused isEdit (StepFooter) + resolveExecutionContext (fireHelpers); add fireHandler timeout->failed test.
FINAL WHOLE-BRANCH REVIEW (1500e4d9..b0082f46, 14 commits): Ready after must-fixes. FE<->BE TriggerRow contract verified identical; lifecycle + claim-first + version semantics + security all verified end-to-end.
  MUST-FIX (Important): setTriggerEnabled rearm never persists recomputed next_run_at -> stale FE row after disable->enable. Fix in rearm + add enable-path test.
  CORRECTION: nextRun.ts is STILL USED (NextRunPreview imports computePreviewRuns) -> do NOT delete.
  Consolidated fix-wave also cleaning: dead resolveExecutionContext, dead isEdit (StepFooter), dead in-memory Trigger type, orphaned i18n keys previewAfterEvent + messageStepTitle, unused dayjs import (schedule.test.ts), + add fireHandler timeout->failed test.
  Genuine follow-up (NOT in this wave): delete/list handler tests; C4 deleteTrigger ignores getTriggerById read error (best-effort, self-heals).
FINAL FIX-WAVE: complete (commit 21a3932e, re-review Resolved+Approved). must-fix (next_run_at on enable) fixed+tested; cleanups safe; nextRun.ts preserved. *** FEATURE MERGE-READY ***
