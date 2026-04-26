import type { z } from 'zod';

import type { CalendarService } from '../../services/calendarService.js';
import {
  bookAppointmentInput,
  checkAvailabilityInput,
  eventRefInput,
  listCalendarsInput,
  listEventsInput,
  updateEventInput,
} from '../../tools/calendarToolSchemas.js';
import {
  BOOK_APPOINTMENT_TOOL_NAME,
  CANCEL_APPOINTMENT_TOOL_NAME,
  CHECK_AVAILABILITY_TOOL_NAME,
  GET_EVENT_TOOL_NAME,
  LIST_CALENDARS_TOOL_NAME,
  LIST_EVENTS_TOOL_NAME,
  UPDATE_EVENT_TOOL_NAME,
} from '../../tools/calendarTools.js';
import {
  executeBookAppointment,
  executeCancelAppointment,
  executeCheckAvailability,
  executeGetEvent,
  executeListCalendars,
  executeListEvents,
  executeUpdateEvent,
} from '../../tools/calendarToolsExecute.js';
import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool } from '../types.js';

export interface CalendarServices {
  service: CalendarService;
  calendarId: string;
}

interface CalendarCtx {
  services: CalendarService;
  orgId: string;
  calendarId: string;
}

function makeCtx(orgId: string, s: CalendarServices): CalendarCtx {
  return { services: s.service, orgId, calendarId: s.calendarId };
}

function makeListCalendars(ctx: CalendarCtx): OpenFlowTool<typeof listCalendarsInput> {
  return {
    description: 'List all calendars accessible by the connected Google account.',
    inputSchema: listCalendarsInput,
    execute: async (_args: z.infer<typeof listCalendarsInput>) => await executeListCalendars(ctx),
  };
}

function makeCheckAvailability(ctx: CalendarCtx): OpenFlowTool<typeof checkAvailabilityInput> {
  return {
    description: 'Find available time slots within a date range.',
    inputSchema: checkAvailabilityInput,
    execute: async (args: z.infer<typeof checkAvailabilityInput>) => await executeCheckAvailability(args, ctx),
  };
}

function makeListEvents(ctx: CalendarCtx): OpenFlowTool<typeof listEventsInput> {
  return {
    description: 'List events on the calendar within a date range.',
    inputSchema: listEventsInput,
    execute: async (args: z.infer<typeof listEventsInput>) => await executeListEvents(args, ctx),
  };
}

function makeGetEvent(ctx: CalendarCtx): OpenFlowTool<typeof eventRefInput> {
  return {
    description: 'Read full details for a single event by id.',
    inputSchema: eventRefInput,
    execute: async (args: z.infer<typeof eventRefInput>) => await executeGetEvent(args, ctx),
  };
}

function makeBookAppointment(ctx: CalendarCtx): OpenFlowTool<typeof bookAppointmentInput> {
  return {
    description: 'Create a new event on the configured calendar.',
    inputSchema: bookAppointmentInput,
    execute: async (args: z.infer<typeof bookAppointmentInput>) => await executeBookAppointment(args, ctx),
  };
}

function makeUpdateEvent(ctx: CalendarCtx): OpenFlowTool<typeof updateEventInput> {
  return {
    description: 'Modify an existing event by id.',
    inputSchema: updateEventInput,
    execute: async (args: z.infer<typeof updateEventInput>) => await executeUpdateEvent(args, ctx),
  };
}

function makeCancelAppointment(ctx: CalendarCtx): OpenFlowTool<typeof eventRefInput> {
  return {
    description: 'Cancel (delete) an event by id.',
    inputSchema: eventRefInput,
    execute: async (args: z.infer<typeof eventRefInput>) => await executeCancelAppointment(args, ctx),
  };
}

function buildAll(ctx: CalendarCtx): Record<string, OpenFlowTool> {
  return {
    [LIST_CALENDARS_TOOL_NAME]: makeListCalendars(ctx),
    [CHECK_AVAILABILITY_TOOL_NAME]: makeCheckAvailability(ctx),
    [LIST_EVENTS_TOOL_NAME]: makeListEvents(ctx),
    [GET_EVENT_TOOL_NAME]: makeGetEvent(ctx),
    [BOOK_APPOINTMENT_TOOL_NAME]: makeBookAppointment(ctx),
    [UPDATE_EVENT_TOOL_NAME]: makeUpdateEvent(ctx),
    [CANCEL_APPOINTMENT_TOOL_NAME]: makeCancelAppointment(ctx),
  };
}

function pickTools(all: Record<string, OpenFlowTool>, names: string[]): Record<string, OpenFlowTool> {
  const result: Record<string, OpenFlowTool> = {};
  for (const name of names) {
    const { [name]: tool } = all;
    if (tool !== undefined) result[name] = tool;
  }
  return result;
}

function isCalendarServices(raw: unknown): raw is CalendarServices {
  if (raw === null || raw === undefined || typeof raw !== 'object') return false;
  return (
    Object.hasOwn(raw, 'service') &&
    Object.hasOwn(raw, 'calendarId') &&
    typeof (raw as { calendarId?: unknown }).calendarId === 'string'
  );
}

function resolveServices(ctx: ProviderCtx): CalendarServices | undefined {
  const raw = ctx.services('calendar');
  return isCalendarServices(raw) ? raw : undefined;
}

function buildToolsSync(toolNames: string[], ctx: ProviderCtx): Record<string, OpenFlowTool> {
  const services = resolveServices(ctx);
  if (services === undefined) return {};
  const calendarCtx = makeCtx(ctx.orgId, services);
  const all = buildAll(calendarCtx);
  return pickTools(all, toolNames);
}

export async function buildCalendarTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Record<string, OpenFlowTool>> {
  const { toolNames, ctx } = args;
  return await Promise.resolve(buildToolsSync(toolNames, ctx));
}
