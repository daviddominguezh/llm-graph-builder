import type { TriggerScheduleInput } from '@openflow/shared-validation/triggers/schedule';

/** Self-contained data the fire webhook needs WITHOUT a DB read of the trigger
 *  row. The fresh production version is resolved at fire time (not embedded). */
export interface TriggerTaskPayload {
  triggerId: string;
  targetEpoch: number; // whole-second epoch of the OCCURRENCE (when the agent runs; = scheduled_for / idempotency key)
  hopEpoch: number; // whole-second epoch of THIS task's own fire time (= scheduleTime; used for the task name). hopEpoch === targetEpoch ⇒ real fire; hopEpoch < targetEpoch ⇒ continuation hop
  agentId: string;
  tenantId: string;
  initialMessage: string;
  schedule: TriggerScheduleInput;
}

export interface ScheduleInput {
  runAt: Date;
  payload: TriggerTaskPayload;
}

export interface CancelInput {
  triggerId: string;
  taskEpoch: number; // taskEpoch = the armed task's hopEpoch (agent_triggers.armed_task_epoch)
}

export interface TriggerScheduler {
  schedule: (input: ScheduleInput) => Promise<void>;
  cancel: (input: CancelInput) => Promise<void>;
}

/**
 * Names are keyed by hopEpoch (each task's own fire time) so a continuation hop
 * and the eventual real fire toward the same targetEpoch get DISTINCT names,
 * avoiding Cloud Tasks' post-completion name-reuse block.
 */
export function taskNameFor(triggerId: string, taskEpoch: number): string {
  return `trigger-${triggerId}-${taskEpoch}`;
}
