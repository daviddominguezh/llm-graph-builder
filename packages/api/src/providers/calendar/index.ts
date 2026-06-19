import {
  BOOK_APPOINTMENT_TOOL_NAME,
  CANCEL_APPOINTMENT_TOOL_NAME,
  CHECK_AVAILABILITY_TOOL_NAME,
  GET_EVENT_TOOL_NAME,
  LIST_CALENDARS_TOOL_NAME,
  LIST_EVENTS_TOOL_NAME,
  UPDATE_EVENT_TOOL_NAME,
} from '../../tools/calendarTools.js';
import type { BuiltinProvider, ProviderCtx, ToolDescriptor } from '../provider.js';
import { buildCalendarTools } from './buildTools.js';
import { CALENDAR_DESCRIPTORS } from './descriptors.js';

async function describeCalendarTools(_ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  return await Promise.resolve(CALENDAR_DESCRIPTORS);
}

const TOOL_NAMES = [
  LIST_CALENDARS_TOOL_NAME,
  CHECK_AVAILABILITY_TOOL_NAME,
  LIST_EVENTS_TOOL_NAME,
  GET_EVENT_TOOL_NAME,
  BOOK_APPOINTMENT_TOOL_NAME,
  UPDATE_EVENT_TOOL_NAME,
  CANCEL_APPOINTMENT_TOOL_NAME,
] as const;

export const calendarProvider: BuiltinProvider<'calendar', typeof TOOL_NAMES> = {
  type: 'builtin',
  id: 'calendar',
  displayName: 'OpenFlow/Calendar',
  description: 'Read availability and manage events on a connected Google Calendar.',
  toolNames: TOOL_NAMES,
  describeTools: describeCalendarTools,
  buildTools: buildCalendarTools,
};
