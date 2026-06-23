-- Remove the Google Calendar OAuth integration.
--
-- The agent's calendar tools are now no-ops (booking is moving to an in-house
-- system), so the google_calendar provider's data + RPC are dropped. The
-- shared oauth_connections table STAYS — MCP OAuth and future first-party
-- integrations use it. Only the google_calendar-specific rows, upsert RPC,
-- unique index, and CHECK constraint are removed.
--
-- The provider CHECK is intentionally left allowing 'google_calendar' so the
-- table keeps its multi-provider shape; with the upsert RPC gone, no new
-- google_calendar rows can be written.

DELETE FROM public.oauth_connections WHERE provider = 'google_calendar';

DROP FUNCTION IF EXISTS public.upsert_google_calendar_oauth_connection(
  uuid, text, text, text, text, text, uuid, timestamptz
);

DROP INDEX IF EXISTS public.oauth_connections_google_calendar_unique;

ALTER TABLE public.oauth_connections
  DROP CONSTRAINT IF EXISTS oauth_connections_google_calendar_no_library_item;
