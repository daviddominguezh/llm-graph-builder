import type { TriggerScheduleInput } from '@openflow/shared-validation/triggers/schedule';

export type {
  ScheduleMode,
  RecurringUnit,
  Weekday,
  RecurringConfig,
  TriggerScheduleInput,
} from '@openflow/shared-validation/triggers/schedule';
export { SCHEDULE_MODES, WEEKDAYS, RECURRING_UNITS } from '@openflow/shared-validation/triggers/schedule';

export interface TriggerFormState extends TriggerScheduleInput {
  initialMessage: string;
}

const DEFAULT_INTERVAL = 5;
const FIRST_DAY_OF_MONTH = 1;

export const DEFAULT_TRIGGER_STATE: TriggerFormState = {
  mode: 'recurring',
  recurring: {
    unit: 'minutes',
    interval: DEFAULT_INTERVAL,
    weekdays: ['mon'],
    dayOfMonth: FIRST_DAY_OF_MONTH,
    time: '09:00',
    startAt: '',
    endAt: '',
  },
  onceDateTime: '',
  initialMessage: '',
};
