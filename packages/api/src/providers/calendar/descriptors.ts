import {
  BOOK_APPOINTMENT_TOOL_NAME,
  CANCEL_APPOINTMENT_TOOL_NAME,
  CHECK_AVAILABILITY_TOOL_NAME,
  GET_EVENT_TOOL_NAME,
  LIST_CALENDARS_TOOL_NAME,
  LIST_EVENTS_TOOL_NAME,
  UPDATE_EVENT_TOOL_NAME,
} from '../../tools/calendarTools.js';
import {
  BOOK_APPOINTMENT_DESCRIPTION,
  CANCEL_APPOINTMENT_DESCRIPTION,
  CHECK_AVAILABILITY_DESCRIPTION,
  GET_EVENT_DESCRIPTION,
  LIST_CALENDARS_DESCRIPTION,
  LIST_EVENTS_DESCRIPTION,
  UPDATE_EVENT_DESCRIPTION,
} from '../../tools/calendarToolsDescription.js';
import type { ToolDescriptor } from '../provider.js';

const MIN_LENGTH = 1;
const MIN_DURATION_MINUTES = 1;

const isoDateTimeSchema = { type: 'string', format: 'date-time' };
const minLengthString = { type: 'string', minLength: MIN_LENGTH };
const emailArraySchema = { type: 'array', items: { type: 'string', format: 'email' } };

const listCalendarsDescriptor: ToolDescriptor = {
  toolName: LIST_CALENDARS_TOOL_NAME,
  description: LIST_CALENDARS_DESCRIPTION,
  inputSchema: { type: 'object', properties: {} },
};

const checkAvailabilityDescriptor: ToolDescriptor = {
  toolName: CHECK_AVAILABILITY_TOOL_NAME,
  description: CHECK_AVAILABILITY_DESCRIPTION,
  inputSchema: {
    type: 'object',
    required: ['startIso', 'endIso', 'durationMinutes'],
    properties: {
      startIso: isoDateTimeSchema,
      endIso: isoDateTimeSchema,
      durationMinutes: { type: 'integer', minimum: MIN_DURATION_MINUTES },
    },
  },
};

const listEventsDescriptor: ToolDescriptor = {
  toolName: LIST_EVENTS_TOOL_NAME,
  description: LIST_EVENTS_DESCRIPTION,
  inputSchema: {
    type: 'object',
    required: ['startIso', 'endIso'],
    properties: {
      startIso: isoDateTimeSchema,
      endIso: isoDateTimeSchema,
    },
  },
};

const getEventDescriptor: ToolDescriptor = {
  toolName: GET_EVENT_TOOL_NAME,
  description: GET_EVENT_DESCRIPTION,
  inputSchema: {
    type: 'object',
    required: ['eventId'],
    properties: { eventId: minLengthString },
  },
};

const bookAppointmentDescriptor: ToolDescriptor = {
  toolName: BOOK_APPOINTMENT_TOOL_NAME,
  description: BOOK_APPOINTMENT_DESCRIPTION,
  inputSchema: {
    type: 'object',
    required: ['startIso', 'endIso', 'title'],
    properties: {
      startIso: isoDateTimeSchema,
      endIso: isoDateTimeSchema,
      title: minLengthString,
      description: { type: 'string' },
      location: { type: 'string' },
      attendees: emailArraySchema,
      addMeetLink: { type: 'boolean' },
    },
  },
};

const updateEventDescriptor: ToolDescriptor = {
  toolName: UPDATE_EVENT_TOOL_NAME,
  description: UPDATE_EVENT_DESCRIPTION,
  inputSchema: {
    type: 'object',
    required: ['eventId'],
    properties: {
      eventId: minLengthString,
      startIso: isoDateTimeSchema,
      endIso: isoDateTimeSchema,
      title: minLengthString,
      description: { type: 'string' },
      location: { type: 'string' },
      attendees: emailArraySchema,
    },
  },
};

const cancelAppointmentDescriptor: ToolDescriptor = {
  toolName: CANCEL_APPOINTMENT_TOOL_NAME,
  description: CANCEL_APPOINTMENT_DESCRIPTION,
  inputSchema: {
    type: 'object',
    required: ['eventId'],
    properties: { eventId: minLengthString },
  },
};

export const CALENDAR_DESCRIPTORS: ToolDescriptor[] = [
  listCalendarsDescriptor,
  checkAvailabilityDescriptor,
  listEventsDescriptor,
  getEventDescriptor,
  bookAppointmentDescriptor,
  updateEventDescriptor,
  cancelAppointmentDescriptor,
];
