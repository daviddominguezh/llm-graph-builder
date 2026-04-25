import type {
  BookAppointmentArgs,
  CheckAvailabilityArgs,
  EventRefArgs,
  ListEventsArgs,
  UpdateEventArgs,
} from '../../services/calendarService.js';
import type { AvailableSlot, CalendarEvent, CalendarSummary } from '../../types/calendar.js';
import { type AccessTokenProvider, callCalendarJson, callCalendarVoid } from './apiClient.js';
import { buildCreateEventBody, buildUpdateEventBody, mapGoogleEvent } from './mappers.js';
import {
  CalendarListResponseSchema,
  EventsListResponseSchema,
  FreeBusyResponseSchema,
  GoogleEventSchema,
} from './responseSchemas.js';
import { computeAvailableSlots } from './slotSelection.js';

const EMPTY_LENGTH = 0;

export async function listCalendarsOp(
  getAccessToken: AccessTokenProvider,
  orgId: string
): Promise<CalendarSummary[]> {
  const data = await callCalendarJson(
    { getAccessToken, orgId, method: 'GET', path: '/users/me/calendarList' },
    CalendarListResponseSchema
  );
  const items = data.items ?? [];
  return items
    .filter((i): i is typeof i & { id: string } => typeof i.id === 'string')
    .map((i) => ({
      id: i.id,
      name: i.summary ?? i.id,
      timeZone: i.timeZone ?? 'UTC',
      primary: i.primary === true,
    }));
}

export async function checkAvailabilityOp(
  getAccessToken: AccessTokenProvider,
  args: CheckAvailabilityArgs
): Promise<AvailableSlot[]> {
  const data = await callCalendarJson(
    {
      getAccessToken,
      orgId: args.orgId,
      method: 'POST',
      path: '/freeBusy',
      body: {
        timeMin: args.startIso,
        timeMax: args.endIso,
        items: [{ id: args.calendarId }],
      },
    },
    FreeBusyResponseSchema
  );
  const busy = data.calendars?.[args.calendarId]?.busy ?? [];
  return computeAvailableSlots({
    rangeStartIso: args.startIso,
    rangeEndIso: args.endIso,
    durationMinutes: args.durationMinutes,
    busy,
  });
}

export async function listEventsOp(
  getAccessToken: AccessTokenProvider,
  args: ListEventsArgs
): Promise<CalendarEvent[]> {
  const data = await callCalendarJson(
    {
      getAccessToken,
      orgId: args.orgId,
      method: 'GET',
      path: `/calendars/${encodeURIComponent(args.calendarId)}/events`,
      query: {
        timeMin: args.startIso,
        timeMax: args.endIso,
        singleEvents: 'true',
        orderBy: 'startTime',
      },
    },
    EventsListResponseSchema
  );
  return (data.items ?? []).map(mapGoogleEvent);
}

export async function getEventOp(
  getAccessToken: AccessTokenProvider,
  args: EventRefArgs
): Promise<CalendarEvent | null> {
  try {
    const event = await callCalendarJson(
      {
        getAccessToken,
        orgId: args.orgId,
        method: 'GET',
        path: `/calendars/${encodeURIComponent(args.calendarId)}/events/${encodeURIComponent(args.eventId)}`,
      },
      GoogleEventSchema
    );
    return mapGoogleEvent(event);
  } catch (err) {
    if (err instanceof Error && err.message.includes('404 ')) return null;
    throw err;
  }
}

function buildBookAppointmentQuery(args: BookAppointmentArgs): Record<string, string> | undefined {
  const query: Record<string, string> = {};
  if (args.input.addMeetLink === true) query.conferenceDataVersion = '1';
  const attendees = args.input.attendees ?? [];
  if (attendees.length > EMPTY_LENGTH) query.sendUpdates = 'all';
  return Object.keys(query).length > EMPTY_LENGTH ? query : undefined;
}

export async function bookAppointmentOp(
  getAccessToken: AccessTokenProvider,
  args: BookAppointmentArgs
): Promise<CalendarEvent> {
  const event = await callCalendarJson(
    {
      getAccessToken,
      orgId: args.orgId,
      method: 'POST',
      path: `/calendars/${encodeURIComponent(args.calendarId)}/events`,
      query: buildBookAppointmentQuery(args),
      body: buildCreateEventBody(args.input),
    },
    GoogleEventSchema
  );
  return mapGoogleEvent(event);
}

function buildUpdateEventQuery(args: UpdateEventArgs): Record<string, string> | undefined {
  if (args.input.attendees === undefined) return undefined;
  return { sendUpdates: 'all' };
}

export async function updateEventOp(
  getAccessToken: AccessTokenProvider,
  args: UpdateEventArgs
): Promise<CalendarEvent> {
  const event = await callCalendarJson(
    {
      getAccessToken,
      orgId: args.orgId,
      method: 'PATCH',
      path: `/calendars/${encodeURIComponent(args.calendarId)}/events/${encodeURIComponent(args.eventId)}`,
      query: buildUpdateEventQuery(args),
      body: buildUpdateEventBody(args.input),
    },
    GoogleEventSchema
  );
  return mapGoogleEvent(event);
}

export async function cancelAppointmentOp(
  getAccessToken: AccessTokenProvider,
  args: EventRefArgs
): Promise<void> {
  await callCalendarVoid({
    getAccessToken,
    orgId: args.orgId,
    method: 'DELETE',
    path: `/calendars/${encodeURIComponent(args.calendarId)}/events/${encodeURIComponent(args.eventId)}`,
    query: { sendUpdates: 'all' },
  });
}
