import type { CalendarService } from '@daviddh/llm-graph-runner';
import { createGoogleCalendarService as createServiceFromApi } from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { resolveGoogleAccessToken } from './tokenResolver.js';

/**
 * Backend-scoped factory: binds the shared api-package CalendarService factory
 * to a Supabase-backed token provider that resolves (and refreshes) the
 * org's Google Calendar access token per call.
 *
 * Used by the simulation path, which has direct DB access. The production
 * edge function path constructs the same CalendarService with a pre-resolved
 * token instead — see supabase/functions/execute-agent/index.ts.
 */
export function createGoogleCalendarService(supabase: SupabaseClient): CalendarService {
  return createServiceFromApi({
    getAccessToken: async (orgId) => await resolveGoogleAccessToken(supabase, orgId),
  });
}
