import type { FormsService } from '@daviddh/llm-graph-runner';

import {
  applyFormFieldsAtomicQuery,
  queryFormData,
  queryFormsForAgent,
  recordFailedAttemptQuery,
} from './formsQueries';

export function createFormsService(): FormsService {
  return {
    getFormDefinitions: (agentId) => queryFormsForAgent(agentId),
    getFormData: (conversationId, formId) => queryFormData(conversationId, formId),
    applyFormFieldsAtomic: (args) => applyFormFieldsAtomicQuery(args),
    recordFailedAttempt: (conversationId, formId, attempt) =>
      recordFailedAttemptQuery(conversationId, formId, attempt),
  };
}
