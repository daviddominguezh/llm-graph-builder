import type { Tool } from 'ai';
import { zodSchema } from 'ai';
import type { z } from 'zod';

import type { CalendarService } from '../services/calendarService.js';
import {
  bookAppointmentInput,
  checkAvailabilityInput,
  eventRefInput,
  listCalendarsInput,
  listEventsInput,
  updateEventInput,
} from './calendarToolSchemas.js';
import {
  BOOK_APPOINTMENT_DESCRIPTION,
  CANCEL_APPOINTMENT_DESCRIPTION,
  CHECK_AVAILABILITY_DESCRIPTION,
  GET_EVENT_DESCRIPTION,
  LIST_CALENDARS_DESCRIPTION,
  LIST_EVENTS_DESCRIPTION,
  UPDATE_EVENT_DESCRIPTION,
} from './calendarToolsDescription.js';
import {
  type CalendarToolContext,
  executeBookAppointment,
  executeCancelAppointment,
  executeCheckAvailability,
  executeGetEvent,
  executeListCalendars,
  executeListEvents,
  executeUpdateEvent,
} from './calendarToolsExecute.js';
import { CloserTool } from './toolEnum.js';

const {
  listCalendars: LIST_CALENDARS_TOOL_NAME,
  checkAvailability: CHECK_AVAILABILITY_TOOL_NAME,
  listEvents: LIST_EVENTS_TOOL_NAME,
  getEvent: GET_EVENT_TOOL_NAME,
  bookAppointment: BOOK_APPOINTMENT_TOOL_NAME,
  updateEvent: UPDATE_EVENT_TOOL_NAME,
  cancelAppointment: CANCEL_APPOINTMENT_TOOL_NAME,
} = CloserTool;

export {
  LIST_CALENDARS_TOOL_NAME,
  CHECK_AVAILABILITY_TOOL_NAME,
  LIST_EVENTS_TOOL_NAME,
  GET_EVENT_TOOL_NAME,
  BOOK_APPOINTMENT_TOOL_NAME,
  UPDATE_EVENT_TOOL_NAME,
  CANCEL_APPOINTMENT_TOOL_NAME,
};

export const DEFAULT_CALENDAR_ID = 'primary';

export interface CreateCalendarToolsParams {
  services: CalendarService;
  orgId: string;
  calendarId?: string;
}

function toolContext(p: CreateCalendarToolsParams): CalendarToolContext {
  return {
    services: p.services,
    orgId: p.orgId,
    calendarId: p.calendarId ?? DEFAULT_CALENDAR_ID,
  };
}

function buildListCalendars(ctx: CalendarToolContext): Tool {
  return {
    description: LIST_CALENDARS_DESCRIPTION,
    inputSchema: zodSchema(listCalendarsInput),
    execute: async () => await executeListCalendars(ctx),
  };
}

function buildCheckAvailability(ctx: CalendarToolContext): Tool {
  return {
    description: CHECK_AVAILABILITY_DESCRIPTION,
    inputSchema: zodSchema(checkAvailabilityInput),
    execute: async (args: z.infer<typeof checkAvailabilityInput>) =>
      await executeCheckAvailability(args, ctx),
  };
}

function buildListEvents(ctx: CalendarToolContext): Tool {
  return {
    description: LIST_EVENTS_DESCRIPTION,
    inputSchema: zodSchema(listEventsInput),
    execute: async (args: z.infer<typeof listEventsInput>) => await executeListEvents(args, ctx),
  };
}

function buildGetEvent(ctx: CalendarToolContext): Tool {
  return {
    description: GET_EVENT_DESCRIPTION,
    inputSchema: zodSchema(eventRefInput),
    execute: async (args: z.infer<typeof eventRefInput>) => await executeGetEvent(args, ctx),
  };
}

function buildBookAppointment(ctx: CalendarToolContext): Tool {
  return {
    description: BOOK_APPOINTMENT_DESCRIPTION,
    inputSchema: zodSchema(bookAppointmentInput),
    execute: async (args: z.infer<typeof bookAppointmentInput>) => await executeBookAppointment(args, ctx),
  };
}

function buildUpdateEvent(ctx: CalendarToolContext): Tool {
  return {
    description: UPDATE_EVENT_DESCRIPTION,
    inputSchema: zodSchema(updateEventInput),
    execute: async (args: z.infer<typeof updateEventInput>) => await executeUpdateEvent(args, ctx),
  };
}

function buildCancelAppointment(ctx: CalendarToolContext): Tool {
  return {
    description: CANCEL_APPOINTMENT_DESCRIPTION,
    inputSchema: zodSchema(eventRefInput),
    execute: async (args: z.infer<typeof eventRefInput>) => await executeCancelAppointment(args, ctx),
  };
}

export function createCalendarTools(p: CreateCalendarToolsParams): Record<string, Tool> {
  const ctx = toolContext(p);
  return {
    [LIST_CALENDARS_TOOL_NAME]: buildListCalendars(ctx),
    [CHECK_AVAILABILITY_TOOL_NAME]: buildCheckAvailability(ctx),
    [LIST_EVENTS_TOOL_NAME]: buildListEvents(ctx),
    [GET_EVENT_TOOL_NAME]: buildGetEvent(ctx),
    [BOOK_APPOINTMENT_TOOL_NAME]: buildBookAppointment(ctx),
    [UPDATE_EVENT_TOOL_NAME]: buildUpdateEvent(ctx),
    [CANCEL_APPOINTMENT_TOOL_NAME]: buildCancelAppointment(ctx),
  };
}
