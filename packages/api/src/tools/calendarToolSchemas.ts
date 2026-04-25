import { z } from 'zod';

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
