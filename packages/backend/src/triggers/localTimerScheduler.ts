import type { CancelInput, ScheduleInput, TriggerScheduler } from './scheduler.js';
import { taskNameFor } from './scheduler.js';

const MAX_DELAY_MS = 2_147_483_647; // setTimeout ceiling (~24.8 days)
const NO_DELAY_MS = 0;

/**
 * Local-dev / CI adapter: POSTs the real fire webhook via in-process timers so
 * the entire fire path runs identically to production. Idempotent by task name,
 * mirroring Cloud Tasks.
 */
export function createLocalTimerScheduler(deps: { fireUrl: string; masterKey: string }): TriggerScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const fire = (name: string, payload: ScheduleInput['payload']): void => {
    timers.delete(name);
    void fetch(deps.fireUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-master-key': deps.masterKey },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  };

  const arm = (input: ScheduleInput): void => {
    const name = taskNameFor(input.payload.triggerId, input.payload.hopEpoch);
    // armToward keeps delay ≤ horizon < MAX_DELAY_MS; clamp is a defensive backstop only.
    const delay = Math.min(MAX_DELAY_MS, Math.max(NO_DELAY_MS, input.runAt.getTime() - Date.now()));
    const existing = timers.get(name);
    if (existing !== undefined) clearTimeout(existing); // idempotent by name (mirror Cloud Tasks)
    const timer = setTimeout(() => {
      fire(name, input.payload);
    }, delay);
    if (typeof timer.unref === 'function') timer.unref();
    timers.set(name, timer);
  };

  const disarm = (input: CancelInput): void => {
    const name = taskNameFor(input.triggerId, input.taskEpoch);
    const t = timers.get(name);
    if (t !== undefined) {
      clearTimeout(t);
      timers.delete(name);
    }
  };

  return {
    schedule: async (input: ScheduleInput): Promise<void> => {
      await Promise.resolve();
      arm(input);
    },
    cancel: async (input: CancelInput): Promise<void> => {
      await Promise.resolve();
      disarm(input);
    },
  };
}
