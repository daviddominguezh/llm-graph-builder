export const LIST_CALENDARS_DESCRIPTION =
  'List every calendar the connected Google account can access (primary, shared, and secondary calendars). Returns each calendar id, display name, timezone, and whether it is the primary calendar. Use to discover which calendar ids can be used with other calendar tools.';

export const CHECK_AVAILABILITY_DESCRIPTION =
  'Find available time slots on the configured calendar within a date range. Given a start/end ISO-8601 datetime range and a desired duration in minutes, returns up to 3 open slots sorted by earliest-first. If fewer than 3 slots exist, returns what is available. If none exist, returns an empty array — suggest alternative dates to the user.';

export const LIST_EVENTS_DESCRIPTION =
  'List events on the configured calendar within a date range. Each event includes id, title, start/end ISO-8601, attendees, and location. Use this when you need narrative context ("what is the user doing that day") — for simple slot-picking prefer check_availability.';

export const GET_EVENT_DESCRIPTION =
  'Read full details for a single event by id: title, description, location, start/end, attendees with RSVP state, meeting link if any. Use to inspect a specific booking before modifying or referencing it.';

export const BOOK_APPOINTMENT_DESCRIPTION =
  'Create a new event on the configured calendar. Requires start/end ISO-8601, a title, and optional description, location, attendee emails, and addMeetLink (auto-generates a Google Meet conference link and returns it in meetingUrl). Returns the created event with its id, which the user or agent may reference to later update or cancel.';

export const UPDATE_EVENT_DESCRIPTION =
  'Modify an existing event by id. Any subset of start/end ISO-8601, title, description, location, or attendees can be changed — omitted fields stay as they were. Use this for reschedules and edits. Prefer this over cancel+book.';

export const CANCEL_APPOINTMENT_DESCRIPTION =
  'Cancel (delete) an event by id. Irreversible. Attendees are notified automatically. Use when the user asks to cancel, not to reschedule.';
