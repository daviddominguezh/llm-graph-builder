import type { CalendarService } from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import {
  bookAppointmentOp,
  cancelAppointmentOp,
  checkAvailabilityOp,
  getEventOp,
  listCalendarsOp,
  listEventsOp,
  updateEventOp,
} from './operations.js';

export function createGoogleCalendarService(supabase: SupabaseClient): CalendarService {
  return {
    listCalendars: async (orgId) => await listCalendarsOp(supabase, orgId),
    checkAvailability: async (args) => await checkAvailabilityOp(supabase, args),
    listEvents: async (args) => await listEventsOp(supabase, args),
    getEvent: async (args) => await getEventOp(supabase, args),
    bookAppointment: async (args) => await bookAppointmentOp(supabase, args),
    updateEvent: async (args) => await updateEventOp(supabase, args),
    cancelAppointment: async (args) => {
      await cancelAppointmentOp(supabase, args);
    },
  };
}
