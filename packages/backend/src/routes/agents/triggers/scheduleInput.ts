import type {
  RecurringConfig,
  TriggerSchedule,
  TriggerScheduleInput,
} from '@openflow/shared-validation/triggers/schedule';

/** Placeholder recurring block for non-recurring modes; never read by the schedule
 *  math (it branches on `mode` first) but satisfies the flat input shape. */
const DEFAULT_INTERVAL = 1;
const DEFAULT_DAY_OF_MONTH = 1;

const EMPTY_RECURRING: RecurringConfig = {
  unit: 'days',
  interval: DEFAULT_INTERVAL,
  weekdays: [],
  dayOfMonth: DEFAULT_DAY_OF_MONTH,
  time: '00:00',
  startAt: '',
  endAt: '',
};

/** Expand the persisted/validated union into the flat input the schedule math and
 *  task payload consume. */
export function toScheduleInput(schedule: TriggerSchedule): TriggerScheduleInput {
  if (schedule.mode === 'recurring') {
    return { mode: 'recurring', recurring: schedule.recurring, onceDateTime: '' };
  }
  if (schedule.mode === 'once') {
    return { mode: 'once', recurring: EMPTY_RECURRING, onceDateTime: schedule.onceDateTime };
  }
  return { mode: 'after-event', recurring: EMPTY_RECURRING, onceDateTime: '' };
}
