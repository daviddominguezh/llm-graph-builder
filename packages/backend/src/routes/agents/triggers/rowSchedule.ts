import type { TriggerSchedule, TriggerScheduleInput } from '@openflow/shared-validation/triggers/schedule';

import type { TriggerRow } from '../../../db/queries/triggerQueries.js';
import { toScheduleInput } from './scheduleInput.js';

/** Reconstruct the schedule union from the flat persisted columns. */
export function scheduleFromRow(row: TriggerRow): TriggerSchedule {
  if (row.mode === 'recurring' && row.recurring !== null) {
    return { mode: 'recurring', recurring: row.recurring };
  }
  if (row.mode === 'once' && row.once_datetime !== null) {
    return { mode: 'once', onceDateTime: row.once_datetime };
  }
  return { mode: 'after-event' };
}

export function scheduleInputFromRow(row: TriggerRow): TriggerScheduleInput {
  return toScheduleInput(scheduleFromRow(row));
}
