import { z } from 'zod';

const CalendarListItemSchema = z.looseObject({
  id: z.string().optional(),
  summary: z.string().optional(),
  timeZone: z.string().optional(),
  primary: z.boolean().optional(),
});

export const CalendarListResponseSchema = z.looseObject({
  items: z.array(CalendarListItemSchema).optional(),
});

const BusyRangeSchema = z.object({
  start: z.string(),
  end: z.string(),
});

export const FreeBusyResponseSchema = z.looseObject({
  calendars: z.record(z.string(), z.looseObject({ busy: z.array(BusyRangeSchema).optional() })).optional(),
});

const GoogleEventTimeSchema = z.looseObject({
  dateTime: z.string().optional(),
  date: z.string().optional(),
  timeZone: z.string().optional(),
});

const GoogleAttendeeSchema = z.looseObject({
  email: z.string().optional(),
  displayName: z.string().optional(),
  responseStatus: z.string().optional(),
});

const GoogleEntryPointSchema = z.looseObject({
  entryPointType: z.string().optional(),
  uri: z.string().optional(),
});

export const GoogleEventSchema = z.looseObject({
  id: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: GoogleEventTimeSchema.optional(),
  end: GoogleEventTimeSchema.optional(),
  attendees: z.array(GoogleAttendeeSchema).optional(),
  hangoutLink: z.string().optional(),
  htmlLink: z.string().optional(),
  conferenceData: z
    .looseObject({
      entryPoints: z.array(GoogleEntryPointSchema).optional(),
    })
    .optional(),
});

export const EventsListResponseSchema = z.looseObject({
  items: z.array(GoogleEventSchema).optional(),
});
