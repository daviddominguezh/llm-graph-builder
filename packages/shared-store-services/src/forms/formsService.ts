// Wraps the portable forms query helpers in the runner's `FormsService` contract
// over an injected `SupabaseClient`. Mirrors the edge wiring in
// web `app/lib/forms` but with no `createClient()` — the client is passed in so
// the service runs on Node, Workers and Deno.
import type { FormsService } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  applyFormFieldsAtomicQuery,
  queryFormData,
  queryFormsForAgent,
  recordFailedAttemptQuery,
} from './formsQueries.js';

export function makeFormsDbService(supabase: SupabaseClient): FormsService {
  return {
    getFormDefinitions: async (agentId) => await queryFormsForAgent(supabase, agentId),
    getFormData: async (conversationId, formId) => await queryFormData(supabase, conversationId, formId),
    applyFormFieldsAtomic: async (args) => await applyFormFieldsAtomicQuery(supabase, args),
    recordFailedAttempt: async (conversationId, formId, attempt) => {
      await recordFailedAttemptQuery(supabase, conversationId, formId, attempt);
    },
  };
}
