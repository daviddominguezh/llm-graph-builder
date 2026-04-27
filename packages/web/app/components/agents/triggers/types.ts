export type ScheduleMode = 'recurring' | 'once' | 'after-event';
export type RecurringUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const SCHEDULE_MODES: ScheduleMode[] = ['recurring', 'once', 'after-event'];
export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const RECURRING_UNITS: RecurringUnit[] = ['minutes', 'hours', 'days', 'weeks', 'months'];

export interface RecurringConfig {
  unit: RecurringUnit;
  interval: number;
  weekdays: Weekday[];
  dayOfMonth: number;
  time: string;
}

export interface TriggerFormState {
  mode: ScheduleMode;
  recurring: RecurringConfig;
  onceDateTime: string;
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
  },
  onceDateTime: '',
};
