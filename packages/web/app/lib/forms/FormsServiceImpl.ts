import type { FormsService } from '@daviddh/llm-graph-runner';

import {
  applyFormFieldsAtomicQuery,
  queryFormData,
  queryFormsForAgent,
  recordFailedAttemptQuery,
} from './formsQueries';

export function createFormsService(): FormsService {
  return {
    getFormDefinitions: async (agentId) => await queryFormsForAgent(agentId),
    getFormData: async (conversationId, formId) => await queryFormData(conversationId, formId),
    applyFormFieldsAtomic: async (args) => await applyFormFieldsAtomicQuery(args),
    recordFailedAttempt: async (conversationId, formId, attempt) => {
      await recordFailedAttemptQuery(conversationId, formId, attempt);
    },
  };
}
