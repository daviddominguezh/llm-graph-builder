import type { CalendarService } from '../../services/calendarService.js';
import type { AccessTokenProvider } from './apiClient.js';
import {
  bookAppointmentOp,
  cancelAppointmentOp,
  checkAvailabilityOp,
  getEventOp,
  listCalendarsOp,
  listEventsOp,
  updateEventOp,
} from './operations.js';

export type { AccessTokenProvider } from './apiClient.js';

export interface CreateGoogleCalendarServiceOptions {
  getAccessToken: AccessTokenProvider;
}

export function createGoogleCalendarService(opts: CreateGoogleCalendarServiceOptions): CalendarService {
  const { getAccessToken } = opts;
  return {
    listCalendars: async (orgId) => await listCalendarsOp(getAccessToken, orgId),
    checkAvailability: async (args) => await checkAvailabilityOp(getAccessToken, args),
    listEvents: async (args) => await listEventsOp(getAccessToken, args),
    getEvent: async (args) => await getEventOp(getAccessToken, args),
    bookAppointment: async (args) => await bookAppointmentOp(getAccessToken, args),
    updateEvent: async (args) => await updateEventOp(getAccessToken, args),
    cancelAppointment: async (args) => {
      await cancelAppointmentOp(getAccessToken, args);
    },
  };
}
