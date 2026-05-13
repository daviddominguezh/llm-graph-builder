import type { z } from 'zod';

import type {
  BookAppointmentInput,
  CalendarAttendee,
  CalendarEvent,
  UpdateEventInput,
} from '../../types/calendar.js';
import type { GoogleEventSchema } from './responseSchemas.js';

export type GoogleEvent = z.infer<typeof GoogleEventSchema>;
type GoogleEventTime = NonNullable<GoogleEvent['start']>;
type GoogleAttendee = NonNullable<GoogleEvent['attendees']>[number];

function toIso(time: GoogleEventTime | undefined): string {
  if (time === undefined) return '';
  const { dateTime, date } = time;
  return dateTime ?? date ?? '';
}

function mapAttendees(attendees: GoogleAttendee[] | undefined): CalendarAttendee[] | undefined {
  if (attendees === undefined) return undefined;
  return attendees
    .filter((a): a is GoogleAttendee & { email: string } => typeof a.email === 'string')
    .map((a) => {
      const { email, responseStatus, displayName } = a;
      return { email, responseStatus, displayName };
    });
}

function extractMeetingUrl(event: GoogleEvent): string | undefined {
  const { hangoutLink, conferenceData } = event;
  if (hangoutLink !== undefined) return hangoutLink;
  const entry = conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video');
  return entry?.uri;
}

export function mapGoogleEvent(event: GoogleEvent): CalendarEvent {
  const { id, summary, description, location, start, end, attendees, htmlLink } = event;
  return {
    id,
    title: summary ?? '(no title)',
    description,
    location,
    startIso: toIso(start),
    endIso: toIso(end),
    attendees: mapAttendees(attendees),
    meetingUrl: extractMeetingUrl(event),
    htmlLink,
  };
}

function buildAttendeesPayload(emails: string[] | undefined): GoogleAttendee[] | undefined {
  if (emails === undefined) return undefined;
  return emails.map((email) => ({ email }));
}

const RADIX_BASE_36 = 36;
const RANDOM_SLICE_START = 2;
const RANDOM_SLICE_END = 10;

function generateRequestId(): string {
  const random = Math.random().toString(RADIX_BASE_36).slice(RANDOM_SLICE_START, RANDOM_SLICE_END);
  return `meet-${Date.now().toString()}-${random}`;
}

function buildConferenceData(addMeetLink: boolean | undefined): Record<string, unknown> | undefined {
  if (addMeetLink !== true) return undefined;
  return {
    createRequest: {
      requestId: generateRequestId(),
      conferenceSolutionKey: { type: 'hangoutsMeet' },
    },
  };
}

export function buildCreateEventBody(input: BookAppointmentInput): Record<string, unknown> {
  const { title, startIso, endIso, description, location, attendees, addMeetLink } = input;
  const body: Record<string, unknown> = {
    summary: title,
    start: { dateTime: startIso },
    end: { dateTime: endIso },
  };
  if (description !== undefined) body.description = description;
  if (location !== undefined) body.location = location;
  const attendeesPayload = buildAttendeesPayload(attendees);
  if (attendeesPayload !== undefined) body.attendees = attendeesPayload;
  const conference = buildConferenceData(addMeetLink);
  if (conference !== undefined) body.conferenceData = conference;
  return body;
}

export function buildUpdateEventBody(input: UpdateEventInput): Record<string, unknown> {
  const { title, description, location, startIso, endIso, attendees } = input;
  const body: Record<string, unknown> = {};
  if (title !== undefined) body.summary = title;
  if (description !== undefined) body.description = description;
  if (location !== undefined) body.location = location;
  if (startIso !== undefined) body.start = { dateTime: startIso };
  if (endIso !== undefined) body.end = { dateTime: endIso };
  const attendeesPayload = buildAttendeesPayload(attendees);
  if (attendeesPayload !== undefined) body.attendees = attendeesPayload;
  return body;
}
