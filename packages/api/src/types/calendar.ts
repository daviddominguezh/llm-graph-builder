export interface CalendarSummary {
  id: string;
  name: string;
  timeZone: string;
  primary: boolean;
}

export interface CalendarAttendee {
  email: string;
  responseStatus?: string;
  displayName?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
  attendees?: CalendarAttendee[];
  meetingUrl?: string;
  htmlLink?: string;
}

export interface AvailableSlot {
  startIso: string;
  endIso: string;
}

export interface BookAppointmentInput {
  startIso: string;
  endIso: string;
  title: string;
  description?: string;
  location?: string;
  attendees?: string[];
  addMeetLink?: boolean;
}

export interface UpdateEventInput {
  startIso?: string;
  endIso?: string;
  title?: string;
  description?: string;
  location?: string;
  attendees?: string[];
}
