import { z } from 'zod';

import { CloserTool } from './toolEnum.js';

const MIN_LENGTH = 1;
const MIN_DURATION_MINUTES = 1;

const isoDateTime = z.iso.datetime({ offset: true });

export const listCalendarsInput = z.object({});

export const checkAvailabilityInput = z.object({
  startIso: isoDateTime,
  endIso: isoDateTime,
  durationMinutes: z.number().int().min(MIN_DURATION_MINUTES),
});

export const listEventsInput = z.object({
  startIso: isoDateTime,
  endIso: isoDateTime,
});

export const eventRefInput = z.object({
  eventId: z.string().min(MIN_LENGTH),
});

export const bookAppointmentInput = z.object({
  startIso: isoDateTime,
  endIso: isoDateTime,
  title: z.string().min(MIN_LENGTH),
  description: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.email()).optional(),
  addMeetLink: z.boolean().optional(),
});

export const updateEventInput = z.object({
  eventId: z.string().min(MIN_LENGTH),
  startIso: isoDateTime.optional(),
  endIso: isoDateTime.optional(),
  title: z.string().min(MIN_LENGTH).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.email()).optional(),
});

export type ListCalendarsInput = z.infer<typeof listCalendarsInput>;
export type CheckAvailabilityInput = z.infer<typeof checkAvailabilityInput>;
export type ListEventsInput = z.infer<typeof listEventsInput>;
export type EventRefInput = z.infer<typeof eventRefInput>;
export type BookAppointmentInputSchema = z.infer<typeof bookAppointmentInput>;
export type UpdateEventInputSchema = z.infer<typeof updateEventInput>;

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
