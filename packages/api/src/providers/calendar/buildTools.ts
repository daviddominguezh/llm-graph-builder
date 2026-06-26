import {
  BOOK_APPOINTMENT_TOOL_NAME,
  CANCEL_APPOINTMENT_TOOL_NAME,
  CHECK_AVAILABILITY_TOOL_NAME,
  GET_EVENT_TOOL_NAME,
  LIST_CALENDARS_TOOL_NAME,
  LIST_EVENTS_TOOL_NAME,
  UPDATE_EVENT_TOOL_NAME,
  bookAppointmentInput,
  checkAvailabilityInput,
  eventRefInput,
  listCalendarsInput,
  listEventsInput,
  updateEventInput,
} from '../../tools/calendarToolSchemas.js';
import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool } from '../types.js';

/**
 * Calendar tools are temporarily disabled. The Google Calendar integration was
 * removed and booking is being migrated to an in-house system. The tools stay
 * registered (names + input schemas intact) so existing graphs keep working,
 * but every call is a no-op that returns a "disabled" sentinel — no external
 * side effects.
 */
const DISABLED_RESULT = {
  disabled: true as const,
  message:
    'Calendar integration is currently disabled. Booking is being migrated to an in-house system and will be available again soon.',
};

type CalendarToolName =
  | typeof LIST_CALENDARS_TOOL_NAME
  | typeof CHECK_AVAILABILITY_TOOL_NAME
  | typeof LIST_EVENTS_TOOL_NAME
  | typeof GET_EVENT_TOOL_NAME
  | typeof BOOK_APPOINTMENT_TOOL_NAME
  | typeof UPDATE_EVENT_TOOL_NAME
  | typeof CANCEL_APPOINTMENT_TOOL_NAME;

function disabledTool(description: string, inputSchema: OpenFlowTool['inputSchema']): OpenFlowTool {
  return { description, inputSchema, execute: (_args: unknown) => DISABLED_RESULT };
}

function buildAll(): Record<CalendarToolName, OpenFlowTool> {
  return {
    [LIST_CALENDARS_TOOL_NAME]: disabledTool('List calendars (currently disabled).', listCalendarsInput),
    [CHECK_AVAILABILITY_TOOL_NAME]: disabledTool(
      'Check availability (currently disabled).',
      checkAvailabilityInput
    ),
    [LIST_EVENTS_TOOL_NAME]: disabledTool('List events (currently disabled).', listEventsInput),
    [GET_EVENT_TOOL_NAME]: disabledTool('Get an event (currently disabled).', eventRefInput),
    [BOOK_APPOINTMENT_TOOL_NAME]: disabledTool(
      'Book an appointment (currently disabled).',
      bookAppointmentInput
    ),
    [UPDATE_EVENT_TOOL_NAME]: disabledTool('Update an event (currently disabled).', updateEventInput),
    [CANCEL_APPOINTMENT_TOOL_NAME]: disabledTool(
      'Cancel an appointment (currently disabled).',
      eventRefInput
    ),
  };
}

const CALENDAR_TOOL_NAMES: readonly string[] = [
  LIST_CALENDARS_TOOL_NAME,
  CHECK_AVAILABILITY_TOOL_NAME,
  LIST_EVENTS_TOOL_NAME,
  GET_EVENT_TOOL_NAME,
  BOOK_APPOINTMENT_TOOL_NAME,
  UPDATE_EVENT_TOOL_NAME,
  CANCEL_APPOINTMENT_TOOL_NAME,
];

function isCalendarToolName(s: string): s is CalendarToolName {
  return CALENDAR_TOOL_NAMES.includes(s);
}

function pickTools(
  all: Record<CalendarToolName, OpenFlowTool>,
  names: string[]
): Partial<Record<CalendarToolName, OpenFlowTool>> {
  const result: Partial<Record<CalendarToolName, OpenFlowTool>> = {};
  for (const name of names) {
    if (!isCalendarToolName(name)) continue;
    const { [name]: tool } = all;
    result[name] = tool;
  }
  return result;
}

export async function buildCalendarTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Partial<Record<CalendarToolName, OpenFlowTool>>> {
  return await Promise.resolve(pickTools(buildAll(), args.toolNames));
}
