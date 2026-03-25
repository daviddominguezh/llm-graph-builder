import type { SupabaseClient } from '../db/queries/operationHelpers.js';

export interface ServiceContext {
  supabase: SupabaseClient;
  orgId: string;
  keyId: string;
}
