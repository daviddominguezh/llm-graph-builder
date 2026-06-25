/**
 * Env-backed trigger configuration. Functions (not constants) so values are read
 * at call time — keeps tests free to mutate `process.env` per case. Shared by the
 * web CRUD sub-router (Task C4) and the fire-handler wiring (Task C5).
 */

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DEFAULT_HORIZON_DAYS = 20;
const DEFAULT_HORIZON_MS =
  DEFAULT_HORIZON_DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
const DEFAULT_EXEC_TIMEOUT_MS = 600000;

/** Deterministic jitter window applied to recurring occurrences (default: none). */
export function jitterWindowMs(): number {
  return Number(process.env.TRIGGER_JITTER_WINDOW_MS ?? '0');
}

/** Max look-ahead a single task may cover; farther targets arm continuation hops. */
export function maxHorizonMs(): number {
  return Number(process.env.TRIGGER_MAX_HORIZON_MS ?? String(DEFAULT_HORIZON_MS));
}

/** User id every trigger run executes as. */
export function defaultUserId(): string {
  return process.env.TRIGGER_DEFAULT_USER_ID ?? '';
}

/** Per-run execution budget in milliseconds. */
export function execTimeoutMs(): number {
  return Number(process.env.TRIGGER_EXEC_TIMEOUT_MS ?? String(DEFAULT_EXEC_TIMEOUT_MS));
}
