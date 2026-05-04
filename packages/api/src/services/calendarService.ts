import type {
  AvailableSlot,
  BookAppointmentInput,
  CalendarEvent,
  CalendarSummary,
  UpdateEventInput,
} from '../types/calendar.js';

export interface CheckAvailabilityArgs {
  orgId: string;
  calendarId: string;
  startIso: string;
  endIso: string;
  durationMinutes: number;
}

export interface ListEventsArgs {
  orgId: string;
  calendarId: string;
  startIso: string;
  endIso: string;
}

export interface EventRefArgs {
  orgId: string;
  calendarId: string;
  eventId: string;
}

export interface BookAppointmentArgs {
  orgId: string;
  calendarId: string;
  input: BookAppointmentInput;
}

export interface UpdateEventArgs {
  orgId: string;
  calendarId: string;
  eventId: string;
  input: UpdateEventInput;
}

export interface CalendarService {
  listCalendars: (orgId: string) => Promise<CalendarSummary[]>;
  checkAvailability: (args: CheckAvailabilityArgs) => Promise<AvailableSlot[]>;
  listEvents: (args: ListEventsArgs) => Promise<CalendarEvent[]>;
  getEvent: (args: EventRefArgs) => Promise<CalendarEvent | null>;
  bookAppointment: (args: BookAppointmentArgs) => Promise<CalendarEvent>;
  updateEvent: (args: UpdateEventArgs) => Promise<CalendarEvent>;
  cancelAppointment: (args: EventRefArgs) => Promise<void>;
}
