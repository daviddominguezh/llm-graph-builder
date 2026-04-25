import type { RegistryTool } from './toolRegistryTypes';

export const CALENDAR_SERVER_ID = '__calendar__';
export const CALENDAR_SERVER_NAME = 'OpenFlow/Calendar';

export const CALENDAR_TOOLS: RegistryTool[] = [
  {
    sourceId: CALENDAR_SERVER_ID,
    group: CALENDAR_SERVER_NAME,
    name: 'list_calendars',
    description:
      'List every calendar the connected Google account can access. Returns id, display name, timezone, and whether it is the primary calendar.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    sourceId: CALENDAR_SERVER_ID,
    group: CALENDAR_SERVER_NAME,
    name: 'check_availability',
    description:
      'Find up to 3 available time slots on the configured calendar within a date range for a given duration.',
    inputSchema: {
      type: 'object',
      required: ['startIso', 'endIso', 'durationMinutes'],
      properties: {
        startIso: { type: 'string', format: 'date-time' },
        endIso: { type: 'string', format: 'date-time' },
        durationMinutes: { type: 'integer', minimum: 1 },
      },
    },
  },
  {
    sourceId: CALENDAR_SERVER_ID,
    group: CALENDAR_SERVER_NAME,
    name: 'list_events',
    description: 'List events on the configured calendar within a date range.',
    inputSchema: {
      type: 'object',
      required: ['startIso', 'endIso'],
      properties: {
        startIso: { type: 'string', format: 'date-time' },
        endIso: { type: 'string', format: 'date-time' },
      },
    },
  },
  {
    sourceId: CALENDAR_SERVER_ID,
    group: CALENDAR_SERVER_NAME,
    name: 'get_event',
    description: 'Read full details for a single calendar event by id.',
    inputSchema: {
      type: 'object',
      required: ['eventId'],
      properties: { eventId: { type: 'string' } },
    },
  },
  {
    sourceId: CALENDAR_SERVER_ID,
    group: CALENDAR_SERVER_NAME,
    name: 'book_appointment',
    description:
      'Create a new event on the configured calendar. Can auto-generate a Google Meet link via addMeetLink.',
    inputSchema: {
      type: 'object',
      required: ['startIso', 'endIso', 'title'],
      properties: {
        startIso: { type: 'string', format: 'date-time' },
        endIso: { type: 'string', format: 'date-time' },
        title: { type: 'string' },
        description: { type: 'string' },
        location: { type: 'string' },
        attendees: { type: 'array', items: { type: 'string', format: 'email' } },
        addMeetLink: { type: 'boolean' },
      },
    },
  },
  {
    sourceId: CALENDAR_SERVER_ID,
    group: CALENDAR_SERVER_NAME,
    name: 'update_event',
    description:
      'Modify an existing event by id. Any subset of start/end/title/description/location/attendees may be changed.',
    inputSchema: {
      type: 'object',
      required: ['eventId'],
      properties: {
        eventId: { type: 'string' },
        startIso: { type: 'string', format: 'date-time' },
        endIso: { type: 'string', format: 'date-time' },
        title: { type: 'string' },
        description: { type: 'string' },
        location: { type: 'string' },
        attendees: { type: 'array', items: { type: 'string', format: 'email' } },
      },
    },
  },
  {
    sourceId: CALENDAR_SERVER_ID,
    group: CALENDAR_SERVER_NAME,
    name: 'cancel_appointment',
    description: 'Cancel (delete) a calendar event by id. Attendees are notified automatically.',
    inputSchema: {
      type: 'object',
      required: ['eventId'],
      properties: { eventId: { type: 'string' } },
    },
  },
];
