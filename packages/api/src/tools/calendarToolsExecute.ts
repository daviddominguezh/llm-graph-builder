import type {
  BookAppointmentArgs,
  CalendarService,
  EventRefArgs,
  UpdateEventArgs,
} from '../services/calendarService.js';
import type { AvailableSlot, CalendarEvent, CalendarSummary } from '../types/calendar.js';
import type {
  BookAppointmentInputSchema,
  CheckAvailabilityInput,
  EventRefInput,
  ListEventsInput,
  UpdateEventInputSchema,
} from './calendarToolSchemas.js';

export interface CalendarToolContext {
  services: CalendarService;
  orgId: string;
  calendarId: string;
}

export async function executeListCalendars(ctx: CalendarToolContext): Promise<{ result: CalendarSummary[] }> {
  const result = await ctx.services.listCalendars(ctx.orgId);
  return { result };
}

export async function executeCheckAvailability(
  args: CheckAvailabilityInput,
  ctx: CalendarToolContext
): Promise<{ result: AvailableSlot[] }> {
  const result = await ctx.services.checkAvailability({
    orgId: ctx.orgId,
    calendarId: ctx.calendarId,
    startIso: args.startIso,
    endIso: args.endIso,
    durationMinutes: args.durationMinutes,
  });
  return { result };
}

export async function executeListEvents(
  args: ListEventsInput,
  ctx: CalendarToolContext
): Promise<{ result: CalendarEvent[] }> {
  const result = await ctx.services.listEvents({
    orgId: ctx.orgId,
    calendarId: ctx.calendarId,
    startIso: args.startIso,
    endIso: args.endIso,
  });
  return { result };
}

function buildEventRef(args: EventRefInput, ctx: CalendarToolContext): EventRefArgs {
  return { orgId: ctx.orgId, calendarId: ctx.calendarId, eventId: args.eventId };
}

export async function executeGetEvent(
  args: EventRefInput,
  ctx: CalendarToolContext
): Promise<{ result: CalendarEvent | null }> {
  const result = await ctx.services.getEvent(buildEventRef(args, ctx));
  return { result };
}

export async function executeBookAppointment(
  args: BookAppointmentInputSchema,
  ctx: CalendarToolContext
): Promise<{ result: CalendarEvent }> {
  const bookArgs: BookAppointmentArgs = {
    orgId: ctx.orgId,
    calendarId: ctx.calendarId,
    input: args,
  };
  const result = await ctx.services.bookAppointment(bookArgs);
  return { result };
}

export async function executeUpdateEvent(
  args: UpdateEventInputSchema,
  ctx: CalendarToolContext
): Promise<{ result: CalendarEvent }> {
  const { eventId, ...input } = args;
  const updateArgs: UpdateEventArgs = {
    orgId: ctx.orgId,
    calendarId: ctx.calendarId,
    eventId,
    input,
  };
  const result = await ctx.services.updateEvent(updateArgs);
  return { result };
}

export async function executeCancelAppointment(
  args: EventRefInput,
  ctx: CalendarToolContext
): Promise<{ result: { cancelled: true } }> {
  await ctx.services.cancelAppointment(buildEventRef(args, ctx));
  return { result: { cancelled: true } };
}
